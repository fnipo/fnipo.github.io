---
layout: custom-post
title:  "Consistency in microservices"
date:   2022-05-22 18:52:58 +0100
categories: distributed-systems
tags: distributed-systems
---

In a microservices or shared-nothing architecture, databases are not shared between bounded-contexts.
In fact the least they share the more decoupled, autonomous and available they are.
[Integration through the database][martin-fowler-integration-database] is replaced by integration through an unreliable communication medium, tipically an API or messaging platform.

This data isolation creates 2 layers of data in a system, as [Pat Helland's paper][pat-helland-paper] describes:
- **Data that lives inside**: it's your classic data stored in a SQL database, it's private and mutable
- **Data that lives outside**: refers to data that flows between services, e.g. messages and API requests. It's public, immutable, and uniquely identified

This separation creates strong boundaries between services, that translates to high autonomy.
A service can do whatever it wants with the data that lives inside and rest assured it will never impact the outside world, as far as it can respect its API and message contracts.

It enables the team that owns this service to tackle tech debt at their own pace, migrate to different technologies, or completely rewrite the service, with minimal coordination across the with the rest of the organization.
(?)Moreover, it empowers an organization with great architectural flexibility, being able to join and split services while reducing the friction that comes from having to coordinate multiple teams.

Services can also benefit from higher availability, particularly if they communicate in a asynchronous way (messaging) that leads to untie services availability to each other, i.e. if one service goes down it doesn't take all the other services down together.

Distributed systems have many advantages, but it adds considerable complexity for systems,
and particularly making it fault-tolerant is a lot of work, as a developer there will be days full of suspicion and paranoia thinking deeply on all the things that can go wrong, ultimately summoning chaos monkeys for help.

TODO: talk that one of the cons is operating on weaker consistency models, as trade-off with higher availability, refer to CAP theorem link laws of physics

This post aims to explore the sources of inconsistencies with this setting.

# Partial executions

A workflow inside a microservice tipically write stuffs to a database and produce a message or API request to another service

What happens when some infrastructure component goes down during the workflow execution and it can't complete?

The beginning of the workflow may execute, but some part at the end may not, the side effects of this workflow execution are then partially applied, and the order of its steps matter.

# At-most-once delivery

Let's imagine a feature for Report Generation that is done asynchronously and may take minutes to complete, the user is updated by email about each stage of the process.
When creating the Report request, it sends an email to the customer to log that a Report Request was created and will be processed soon.

@startmermaid
flowchart TB
    A(Generate Report HTTP request) --> |ID: '123'| B{Does ReportRequest '123' exist?}
    B --> |Yes| C("Return HTTP 409 \n #40;End#41;")
    B --> |No| D[(Create ReportRequest record \n on database)]
    D --> E>Send HTTP request to Email Platform]
    E --> F("Return HTTP 201 \n #40;End#41;")
@endmermaid

The steps of this workflow are:
1. The frontend calls the Report API passing on an ReportRequestId and criterias for the report
2. The API validates if that ReportRequestId is already created
3. If yes, it returns an HTTP 409 code to signal the Id provided has already been taken by an existing resource
4. If not, it creates the ReportRequest record on the database
5. At the end it sends a request to an Email platform to update the customer that the ReportRequest was created
6. Returns an HTTP 201 code

What if the Email platform is down at step 5?
The workflow created the ReportRequest record on the database, and now any attempt to retry the request will execute up to step 3

After the database writing at step 4 is executed, on best case scenario the step 5 successfully sends the Email request once, otherwise the Email request is lost forever

This is an at-most-once guarantee, tipically there is a database writing step that marks the workflow as completed (step 4), together with an idempotency guard (step 2) to supress duplicated side effects.
When retrying after the workflow is marked as completed on the database, your service has no way to distinguish between the scenario where the client is sending a duplicated request, or the scenario where the client is retrying a partially executed request that failed after the workflow was marked as complete.

This model is applied on non-critical messages or API requests that presents low business impact if it is not sent.

This is not applicable for critical communication that triggers a chain of processings or [Saga][saga] on other services.
If the message is lost forever, downstream services will never be able to pick it up and continue the chain of processings.

# At-least-once delivery

Now let's imagine a Order creation service that produces an OrderCreated message to trigger workflows downstream for: Handle payment, Reserve inventory, Produce reports, etc...

@startmermaid
flowchart TB
    A(Order Create HTTP request) --> |ID: '123'| B{Does Order '123' exist?}
    B --> |Yes| C("Return HTTP 409 \n #40;End#41;")
    B --> |No| D[/Produce OrderCreated message/]
    D --> E[(Create Order record \n on database)]
    E --> F("Return HTTP 201 \n #40;End#41;")
@endmermaid

The steps of this workflow are:
1. The frontend calls the Order API passing on the Order payload
2. The API validates if that OrderId is already created
3. If yes, it returns an HTTP 409 code to signal the Id provided has already been taken by an existing resource
4. If not, it produces an OrderCreated message to a topic
5. At the end it creates the Order record on the database
6. Returns an HTTP 201 code

If the message is produced before the database writing, in a partial execution scenario the client can keep retrying until the database writing succeeds.

This is an at-least-once guarantee, it guarantees the message is always delivered, up to N times as the workflow is retried N times until it fully executes.

> Problem solved, happy days! \o/ ... right? RIGHT???

**Idempotency**

The first challenge is that this workflow is not responsible for supressing duplicated side effects anymore.
Services consuming the OrderCreated message may assume multiple Orders were created.
Hence this model requires the messages to be uniquely identified, e.g. by an OrderId field, and it requires an effort accross the system to ensure this identifier is used for deduplication and idempotency

This is easy because services should be idempotent anyway to be resilient to situations that may cause messages to be consumed >1 times even though it was produced only once, such as when processing in batches or consumer offset skews.

**Race conditions**

The second challenge is race conditions.
What happens if is fails at step 5 and it takes many retries to succeed?
During this time window downstream services may already processed the OrderCreated message faster than the database writing suceeds, maybe one of these services attempted to make HTTP requests back to your service to ask more information about the Order and it failed because the Order didn't exist yet.

Race conditions and temporary inconsistencies are in the nature of distributed systems, services must be designed with resilience in mind, assuming anything may fail anytime.
As far as things are eventually consistent it is fine to mitigate these with resilience guards, the same way you would validate if inputs are null before executing a function.

**Rollbacks**

What if at step 5 you discover the Order can't be created?
Maybe some of the business invariants is checked at the database level, maybe this is a non-deterministic flow such as a reservation and the database writing is competing for resoures and the writting fails to avoid overbooking, or maybe the client stops retrying the workflow.
But downstream services are processing the message already, handling payment, moving inventory, and it rippled out a permanent inconsistency across the system.

The fundamental problem here is lying to the outside world that something was completed, but you are not sure it will be.

Data that lives outside is immutable, a message can't be unsend and rollback across the system takes a heavy toll.

In order to rollback it needs to span a whole Order Cancellation saga, to notify other services and allow them to take compensatory actions, e.g. refund payment.
Cancellation sagas may exist as part of the business rules, but in this case it exists purely for technical reasons.
Saga implementations are complex, it requires strong coordination effort and testing between multiple teams.

The most consistent way is to always produce the message as the last step and not make assumptions, but how to do it in a resilient way?

# Dual-writes

This problem is known as dual-writes, it happens anytime a workflow needs to write to multiple storages and need them to happen atomically, so either they all happen or none of it happen.

The chances of inconsistencies increases as the workflow is extended to write to multiple storages: Database, messaging platform, update cache, update elasticsearch, etc...

Besides this, it ties the availability of multiple infrastructure components reducing the overall availability of the workflow:

From [AWS SLAs][aws-slas]:
- AWS messaging availability is 99.5% (1 day downtime an year)
- AWS databases availability is 99.5% (1 day downtime an year)

Following the formula for the compound probability of independent events occurring together:
$ P (A \text{ and } B) = P(A) * P(B) $

$ 0.995 * 0.995 = 0.990 $

The overall workflow availability based on dual-writes is reduced to 99.0%, or 3 days downtime an year.

# Change Data Capture (CDC)

CDC is a built-in feature in popular databases such as [Cassandra][cassandra-cdc] and [Cosmos DB][cosmos-cdc] to implement the Observer pattern on data, it allows to implement a service that reacts to a stream of data changes and do some operation, similar to what traditional Triggers provided but completely extracting logic from the database layer

The same could be achieved by querying the database regularly, but there would be limitations on latency, and on capturing deletes and updates that can only be provided by reading the actual log of transactions.

CDC allows for a low-latency pull-based access to the database log of transactions, guaranteed to capture all data changes, with at-least-once guarantees

With CDC, one could make a component that reacts when an new Order is inserted on the Order table, and uses it to produces the OrderCreated message asynchronously.
This provides a stronger consistency guarantees that the message will eventually be produced and always after the database writting.

Well, almost there...
This is an idea I had myself when refactoring a project and realized it would be a bad idea.

The problem with this approach is that it takes away from the workflow the power of defining the message content.
Complexy increases because the message producing logic is now hidden on this intermediate service that produces the OrderCreated message, and the message model is strongly coupled to the Order data model.
This coupling leads to poluting your data model to facilitate the job of the OrderCreator producer as it doesn't have enough context to do its job except from what it reads from the database.
It will lead to a data model that is a mix of data and messaging model, that tries to satisfies both needs but ultimately doesn't fit any.

# The outbox pattern

A better design with CDC is by implementing an Outbox, and define clear boundaries between data model and message model.

The Outbox Pattern is a technique that uses your database as a queue, and uses an [Transaction Log Tailing][transaction-log-tailling] mechanism based on CDC to replicate data from the database queue to a messaging platform.

The message model is defined on the OrderCreatedOutbox table on the database completely decoupled from the Order table model.
It also gives the control back to the workflow on populating the message and its content.
With an outbox the workflow can either do both data and message writting atomically in a database transaction, or not use a transaction but be able to query the database to check if the message was populated and retry if needed.

Moreover, it increases the workflow availability by depending only on the database availability.

The outbox pattern guarantees the message is eventually produced to the messaging platform.

(TODO: Debenzium and Equinox are known tools to facilitate CDC on top of many storage technologies)

# Event sourcing

> "Eventsourcing uses storage as a way of communication, it solves storage and messaging for you" by Vaugh Vernon

On an event sourced database data is stored as it were messages, there are no tables, instead there are streams of events that mimics a queue of messages.
In fact the difference from events and messages, are that events are part of the data that lives inside layer (but also immutable), whether messages are part of the data that lives outside layer.

Unfortunately *Event* is such an overheaded term that is used on both situations, [Martin Fowler][martin-fowler-twitter] has a nice presentation on the many meanings of the *Event* term:
![](https://www.youtube.com/watch?v=STKCRSUsyP0&width=400&height=250)

An event is both a data to be stored on the database and a data that carries enough context to communicate what has happened to an aggregate.
Because it is so close to a message, it is simpler to implement a CDC-based message producer that has context to do its job! It is job is simply deciding if an event should be published to the outside world on the messaging platform.
As pointed in [Change Data Capture (CDC)](#change-data-capture-cdc), complexity is also increased with this approach, and it is still important to not fall into the trap of leaking the message model to the event model,
it should leverage stream-table join operations to enrich the final message.

# Event-carried state

Another source of inconsistency is completely isolated on the data that lives outside layer, it happens when services are weakly integrated to each other and their contracts don't communicate clearly.
Messages can be designed as deltas, meaning they individually don't contain enough information and a service consuming this contract has to join information from multiple messages to reach enough information to make a decision.
It leaves a lot of room for inference and bad assumptions.

Contracts should strive for intuitive consistency, and messages design with event-carried state provide not just information about the event itself but also a summary of the current state of an aggregate, so consumers don't have to infer the state of the aggregate.
(?) Another challenge is that messages can be consumed out of order being even harder to make inferrences.

[martin-fowler-integration-database]: https://martinfowler.com/bliki/IntegrationDatabase.html
[pat-helland-paper]: https://queue.acm.org/detail.cfm?id=3415014
[saga]: https://microservices.io/patterns/data/saga.html
[aws-slas]: https://aws.amazon.com/legal/service-level-agreements/
[cosmos-cdc]: https://docs.microsoft.com/en-us/azure/cosmos-db/sql/change-feed-processor
[cassandra-cdc]: https://cassandra.apache.org/doc/latest/cassandra/operating/cdc.html
[transaction-log-tailling]: https://microservices.io/patterns/data/transaction-log-tailing.html
[martin-fowler-twitter]: https://twitter.com/martinfowler