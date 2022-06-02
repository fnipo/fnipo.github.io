---
layout: custom-post
title:  "Consistency in microservices"
date:   2022-05-22 18:52:58 +0100
categories: distributed-systems
tags: distributed-systems
---

@startmermaid
sequenceDiagram
    participant Alice
    participant John
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
@endmermaid

@startmermaid
graph TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
@endmermaid

"Distributed systems are a collection of entities, each of which is autonomous, programmable, asynchronous and failure-prone, and which communicate through an unreliable communication medium."

(TODO: refer to DDD database integration language)
As such, in a microservices or shared-nothing architecture services don't share its storage, the least they share the more decouple they are from each other, the more autonomous they are, the more available they are.
They integrate to each other through an API or an messaging platform, intead of integrating through the database.

(TODO: Include monotonic term somewhere)

(TODO: mention Keep what changes together, together mindset? or is more related to a DDD article?)

By making a service data isolated from the outside world, there now 2 layers of data in a system:
- Data that lives inside (Database)
- Data that lives outside (Messages and API requests)

That separation creates a strong boundary between services, and strong boundaries always translate to high autonomy.
Essentially a service can do whatever it wants with the data that lives inside and it will never impact the outside world, as far as it can produce the same message and API contracts to the outside world.
This means the team that owns a service can refactor their code as much as they want, they can evolve their data model, migrate to different database technologies, as they see fit and independently of the rest of the organization.
Tech debt can be tackled isolated in a service per service basis, without requiring a lot of coordination accross the organization
Also operationally, if the database of service A goes down it doesn't impact the other services using other databases, and if the service A itself goes down the other services can still continue processing the last messages produced in the message platform

It is all beaultiful so far, distributed systems are easy until things start to fail...

While a distributed shared-nothing architecture has many advantages, it usually also incurs additional complexity for applications

Let's explore some of the sources of inconsistencies with this setting

TODO: right?
Temporary inconsistency happens due to race conditions and propagation lags.
Long-term inconsistency happens for two reasons: Partial execution and unclear integration contracts (delta messages and inferences, specially when out of order)

# Partial executions

@startmermaid
graph LR
    A[Process input] --> B[Side effect]
    B -->C[End]
@endmermaid

A workflow inside a microservice tipically write stuffs to a database (inside data layer) and produce a message or Api request to another service (outside data layer)

What happens when some infrastructure component goes down during the workflow execution and it can't complete?

In this case, the side effect of this workflow execution is partially applied, and the order of the workflow steps matter.

# At most once behavior

@startmermaid
graph LR
    A[Order Create request input] --> |ID: '123'| B{Does Order '123' exist?}
    B --> |Yes| C[END]
    B --> |No| D[Create Order on the database]
    D --> E[Produce OrderCreated message]
    E --> F[End]
@endmermaid

Let's assume this workflow for an Order Creation:
1. Create the Order record in the storage
2. Make a fire-and-forget call to an Email service that will notify the user the order was created

So it does the database writing before producing of the message.

In a partial execution scenario, maybe your service managed to create the record on the database but failed to produce the message at the end.

Tipically there is a database writing step that marks the workflow as completed, i.e creating the Order record on the database, so it is used for idempotency to guard the whole workflow execution from executing twice, i.e. creating the order twice, at the point this database writing is done retrying the workflow is not possible.
If retrying this workflow, it will skip both the database writing and the message producing as the order is already created, hence the message will never be produced in case of partial execution
Essentially your service has no way to distinguish between the scenario where someone is trying to create an order that was already fully created, and the scenario where someone is retrying a partially executed flow that failed at the message producing step.
Any solution here will involve writing data in some storage to track if the message was produced and ultimately it boils down to the same problem: "which step should I do first? Write to the database or produce the message?"

That is what is called an at-most-once behavior.
By being at the last step of the flow, the message on the best case scenario will be produced once, otherwise it will never be produced.

This model is applied on non-critical messages that presents no business impact if it is lost, i.e. a message to produce an email log to the customer with redundant information that the user have other ways to access in the system, i.e. sensor samples data where it is ok to lose a few samples and we are mostly interested on the overall collection of samples.
Basically you are assuming that skipping a few messages is fine.

But for critical messages that are revelevant to trigger a chain of processings or Saga with business impact, this is not the ideal model.
With the message lost forever, downstream services will never be able to pick up that Order and continue the chain of processings,
i.e. an Order items will never be reserved if the Reservation component was never notified that an Order was created.

"An idempotent operation is one that you can perform multiple times, and it has the same effect as if you performed it only once"
duplicate supression

TODO: think if other vocabulary makes sense because at least once is possible if retrying the message without checking if order created

# At least once behavior

@startmermaid
graph LR
    A[Order Create request input] --> |ID: '123'| B{Does Order '123' exist?}
    B --> |Yes| C[END]
    B --> |No| D[Produce OrderCreated message]
    D --> E[Create Order on the database]
    E --> F[End]
@endmermaid

Assuming the following workflow for an Order Creation:
1. Produce a OrderCreated message to a topic that will be consumed by a downstream service to handle inventory reservation for that order items
2. Create the Order record in the storage

Now if the message is produced before the database writing, in a partial execution scenario, we can keep retrying until the database writing succeeds.
The database writing is the step that switchs if the whole workflow was already processed or not, for the sake of avoiding duplicated orders

This is known as at-least-once behavior, it will produce N messages if you retry N times until it fully executes, it guarantees the message is always produced.
As it retries the OrderCreated message can be produced multiple times until the Order is eventually created on the storage

Problem solved, happy days! \o/ ... right? RIGHT???

Well, one clear problem now is that if you produce N message for the same Order creation the downstream services may understand that multiple Orders were created.
Hence, this model requires an effort to ensure all services are handling idempotency correctly, and that your message has a key that can be used to deduplicate messages,
i.e Order ID can be used as the idempotency key
Idempotency should be handled anyway by downstream services for resiliency, as infrastructure issues may cause messages to be consumed >1 times although it was not produced more than once, i.e. when retrying a partially processed batch or consumer offset skews
TODO: any other kafka rebalance issues that cause duplicate consuming?

But there is a more complicated problem due to the fact you now created a race condition scenario, the downstream service may consume this message faster than the database writing suceeds
If the message gets published to the outside world, it will trigger actions on other services for an Order that doesn't exist in your database yet, i.e. the Reservation component may start reserving the items for that order.
Maybe one of these services will make requests back to your service about that Order and your service doesn't even know it exists yet...

Moreover, what if you discover for some reason the Order can't be created on the database?
Maybe some of the business invariants is validated at the database level, or maybe this is a non-deterministic flow such as a reservation workflow and the database writing is competing for resoures, so the writing may fail to not overbook and you may need to rollback, but now the Order was already announced as Created to the outside world, other services are already handling payment for that, producing reports, sending notifications, moving inventory in distribution centers, etc...
(TODO: think about this better, race conditions are in a space of ms not hours, when it is okay to use this model?)

The fundamental problem here is lying to the outside world that something was done but it was not yet, assuming it will succeed
If you think through, the message should always be the last step.

This model is popular though, it is simple enough and is applicable to most of the flows.
The race conditions can be handled if components are designed with resilience in mind and assuming that anything may fail.
As far as you can ensure things will be eventually consistent it is just a temporary inconsistency.
The main problem though is that if at the database writing step you realize you need to cancel the operation, you have a permanent inconsistency in your data as you can't unsend the message, and getting things back to a consistent state costs a heavy toll.
You may need to take compensatory actions and produce a Cancellation message that may span a whole Cancellation saga to allow other services to also take compensatory actions.

Rollback happens for business needs, the problem here is having to rollback for technical reasons purely

Another problem has to do with how you design your message, this is going to be more explored at the Event-carried state section below (TODO: link)
In summary, generating N redundant messages is fine consistency-wise as far as there is a clear deduplication/idempotency key on the message, i.e OrderId, so downstream services don't assume multiple orders are being created instead

"Implementing fault-tolerant mechanisms is a lot of work, it requires a lot of careful thinking all the things that can grow wrong. In distributed systems, suspicion, pessimism and paranoia pays off."
Martin

# The problem of dual-writes

The problem above is known as dual-write, it happens anytime you need to write to multiple storages and expect that either they all happen, or none of it happen, meaning atomicity.

It gets worse as you extend the workflow to write to multiple storages: Database, messaging platform, update cache, update elasticsearch, etc...

Besides the inconsistency issues, this pattern ties the availability of multiple infrastructure components reducing the overall availability of the workflow
(TODO: maybe quick show how availability reduces when tied, use math formula with spaceship effect)

Lets go through a few possible solutions for dual-writes...

# Change Data Capture

To deal with the inconsistency issues above, we want the database writing and the message producing to either execute successfully or both to fail, we want atomicity here.

In this case you want the Database writing and the message producing 

Change Data Capture is a mechanism to implement the Observer pattern on databases, you can implement a service that reacts to data changes and do some operation, similar to what traditional Triggers provided but completly extracting logic from the database layer

Changes are available as a stream

Databases such as Cassandra and CosmosDb (https://docs.microsoft.com/en-us/azure/cosmos-db/sql/change-feed-processor) provide built-in features to allow you to read the log of transactions directly. 
Debenzium and Equinox are known tools to facilitate CDC on top of many storage technologies.

CDC allows for low-latency pull-based data replication, with at-least-once guarantees, and able to capture all data changes as it reads from the log of transactions.
A similar mechanism could be implementing by querying the database itself regularly, but there are limitations on latency, and on capturing deletes and updates that can only be provided by reading the actual log of transactions.

With CDC in place, we could make a component that checks when an Order is created on the Order table, reacts to that insert and produces a message.

This is an idea I had myself while ago in a project, and quickly realized it would be a bad idea.
First it takes away the responsibility of defining the message content from the workflow which has all the context in place to do this job to be hidden away on a message producer service,
while it may work for a simple scenario it most likely won't as you extend your system because the message producer service reacting from CDC will need to make dangerous inferences over the data, and inferences are always dangerous.
What if we need to produce an OrderProcessed message now? The message producer will need to make inferences on top of the status field value, and not as simple anymore as in the Created message which is all about checking if a new row was inserted.
"Ok, but what if we make an append-only OrderUpdate table, now we simplify the inference again to an insertion"
Most likely you will end up poluting your data model for the sake of mitigating inferences that is only needed on the first place because the message producer doesn't have context enough to do its job.
Your data model will end up being a mix of data + messaging model that tries to satisfies both needs but that ultimately doesn't fit any.

# The outbox pattern

We can use CDC in a better way, if we can split what is the data model, and what is the message model.

The Outbox Pattern is a technique where you use your database as a queue and has an infrastructure component based on Change Data Capture technique that propagates the database queue to a messaging platform asynchronously.

The outbox pattern guarantees both the database writing and the message happens atomically, it uses the database as a queue by having a dedicated table to hold the messages, which are asynchronously replicated to the messaging platform by an infrastructure component leveraging CDC in a Transaction Log Tailing pattern (https://microservices.io/patterns/data/transaction-log-tailing.html)

Now, you can do both the database writing and the queue writing at the database in a transaction and tied to the availability of the database only.
Or you can write them without a transaction and still benefit from the high-availability and be able to query the database and check if the message was written to the queue table on the database.

The outbox pattern guarantees the message is eventually produced to the messaging platform.

Moreover, the outbox pattern gives control of the message content to the workflow itself where you have the full context of the operation, you may have a dedicated table operating as a queue, decoupling the CDC component from the core data model and giving your workflow control on what exact it wants to produce

# Event sourcing

"Eventsourcing uses storage as a way of communication, it solves storage and messaging for you" Vaugh Vernon

Event sourcing stores data on the database in the format of events, it is as if they were messages except that they are part of the data that lives inside layer, that being the main distinction between events and messages

(TODO: show what a event sourced table looks like)

An event communicates and carries the context of what happened to an aggregate, hence it is much simpler now to implement a message producer from CDC that reacts from the event writing to produce a message to the outside world, as it now has all the context in place
Using event-sourcing, then the CDC logic is just about deciding which event should trigger a message to the outside world, potentially doing further queries to the DB to hydrate the event to produce the message

An event model should still not be poluted with the messaging model, and the message producer may still need to extra queries to hydrate the final message to be produced

# Event-carried state

Another source of inconsistency is when services have a weak integration and don't communicate clearly.
This may happen if messages are designed as deltas containing pieces of information, rather than a summary providing the whole picture.
Inferences as such are source of inconsistencies when downstream services assume the wrong thing, therefore contracts that communicate clearly, strive for intuitive consistency.
Inferences are even harder if messages are consumed out of order...

Event-carried state aims to provide a summary snapshot of the aggregate it relates with, so no assumptions are made on the state of the aggregate after the hapenning of this event.