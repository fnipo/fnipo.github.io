---
title:  "Merging Message Types in a Kafka Topic"
date:   2024-09-16 00:00:00 +0000
categories: distributed-systems
tags: distributed-systems
header:
    og_image: /assets/2024-09-16.jpg
---

When I first started designing event-driven systems I followed the guideline of separating each message type into 
its own dedicated topic, it seemed like a foolproof way to ensure clarity and a maintainable system.

As I encountered systems with hundreds of kafka topics, I began to see some downsides, the sheer amount of moving parts and their interactions made it hard to account for all the potential race conditions and eventual consistency scenarios, it became a cognitive burden on the team, leading us to rethink our approach. We started asking ourselves:
- Do we need to apply eventual consistency everywhere?
- How can we make a simpler version of this complexity?

```plantuml!
@startuml

!theme bluegray
skinparam QueueBackgroundColor #FFFFFF
skinparam QueueBorderColor #acacac
skinparam QueueFontColor #5a5a5a
skinparam backgroundColor #FFFFFF
skinparam ArrowColor Gray
left to right direction

rectangle order_producer [
    **Order Messages Producer**
]

queue order_created_topic [
    **OrderCreated Topic**
]

queue order_processed_topic [
    **OrderProcessed Topic**
]

queue order_packed_topic [
    **OrderPacked Topic**
]

queue order_shipped_topic [
    **OrderShipped Topic**
]

rectangle inventory_consumer [
    **Inventory Domain Consumer**
]

rectangle reporting_consumer [
    **Reporting Domain Consumer**
]

order_producer --> order_created_topic : Produces OrderCreated\n(pk: orderId)
order_producer --> order_processed_topic : Produces OrderProcessed\n(pk: orderId)
order_producer --> order_packed_topic : Produces OrderPacked\n(pk: orderId)
order_producer --> order_shipped_topic : Produces OrderShipped\n(pk: orderId)

order_created_topic --> inventory_consumer : Consumes to handle\nproducts pre-reservation
order_created_topic --> reporting_consumer : Consumes for auditing
order_processed_topic --> reporting_consumer : Consumes for auditing
order_packed_topic --> reporting_consumer : Consumes for auditing
order_shipped_topic --> reporting_consumer : Consumes for auditing

@enduml
```{: .align-center}

We decided to refactor our system, taking onboard a model where multiple messages types could coexist within a single topic, as long as the messages belong to the same domain and have symmetric volumes. It allowed to commit only to the complexity needed on a case-by-case basis, optimizing for people's cognitive resources - the most expensive resource at any company.

```plantuml!
@startuml

!theme bluegray
skinparam QueueBackgroundColor #FFFFFF
skinparam QueueBorderColor #acacac
skinparam QueueFontColor #5a5a5a
skinparam backgroundColor #FFFFFF
skinparam ArrowColor Gray
left to right direction

rectangle order_producer [
    **Order Messages Producer**
]

queue topic [
    **Order Topic**
]

rectangle inventory_consumer [
    **Inventory Domain Consumer**
]

rectangle reporting_consumer [
    **Reporting Domain Consumer**
]

order_producer --> topic : Produces OrderCreated\n(pk: orderId)
order_producer --> topic : Produces OrderProcessed\n(pk: orderId)
order_producer --> topic : Produces OrderPacked\n(pk: orderId)
order_producer --> topic : Produces OrderShipped\n(pk: orderId)

topic --> inventory_consumer : Consumes OrderCreated to handle\nproducts pre-reservation
topic --> reporting_consumer : Consumes all Order messages\nfor auditing

@enduml
```{: .align-center}

This also shifted my designing approach, I started seeing dedicated topics per message type as an optimization when eventual consistency applies, but as anything in software engineering it comes with trade-offs, the key is to carefully evaluate the trade-offs in the context of your specific need.

## Prerequisites: Before You Consolidate

Topic consolidation is not a free simplification. It trades one form of complexity (too many topics) for another (shared failure surface). **Do not attempt consolidation without addressing these prerequisites first.**

#### 1. Schema Registry with Validation
All message types in a consolidated topic must be strictly validated at produce time. A single malformed message from any producer can cascade to all consumers. You need:
- A schema registry (Confluent Schema Registry, AWS Glue, etc.) enforcing compatibility rules.
- Producer-side schema validation failing hard on invalid payloads.
- Clear versioning strategy for each message type.

#### 2. Observability That Discriminates by Message Type
You cannot observe "all order messages" as a blob. You must be able to trace, alert, and debug by message type. This requires:
- Logging that extracts and tags the message type on every consume operation.
- Metrics per message type (throughput, latency, error rate, per-consumer hit rate).
- Tracing integration (e.g., distributed tracing headers) to follow specific message types across consumers.
- Alerting rules that distinguish error patterns by message type.

#### 3. Dead Letter Queue (DLQ) and Error Handling Strategy
When poison messages arrive, you need a clear path to isolate and replay them. Define:
- A DLQ naming convention and monitoring.
- Consumer exception handling: which errors go to DLQ, which are retried inline, which are fatal.
- A replay and recovery procedure that does not block consumers for days.

#### 4. Clear Bounded-Context Ownership
All message types in the topic must belong to the same domain. This is not just DDD terminology:
- **Same domain** means the same team owns the schema, semantics, and contract.
- **Different domains** on the same topic means split ownership, conflicting deployments, and availability coupling.
- Document the bounded context explicitly: "This topic contains all Order domain events."

#### 5. Consumer Idempotency or Agreed Delivery Semantics
Consolidated topics mean higher contention and increased crash/rebalance risk. Consumers must be prepared to process the same message multiple times:
- Idempotent processing: the same message processed twice has the same effect as processed once.
- Or explicit agreement: "We use exactly-once delivery with transactional writes to [system]."
- Document your choice per consumer and test it under rebalance.

**Missing any of these? Do not consolidate yet.** Each prerequisite failure makes consolidation fragile; missing all five makes it dangerous.

---

## The Core Risks: Why Consolidation Fails

#### Poison-Message Cascades (The Primary Constraint)
A single malformed or unexpected message can crash every consumer of the consolidated topic. This is the binding constraint of consolidation.

**Real-world example**: A producer emits an `OrderCreated` with an invalid currency code. The JSON parser on all consumers fails. Thirty seconds later, all three consumer instances are in a death loop, unable to fetch, unable to commit, unable to process the backlog. The consolidated topic is blocked until someone manually seeks past the poison message or DLQ-forwards it.

**With separate topics**, only one consumer would fail.
**With consolidation**, all consumers fail together.

This is why [Prerequisite 1](#1-schema-registry-with-validation) and [Prerequisite 2](#2-observability-that-discriminates-by-message-type) are non-negotiable.

#### Failure Cascade Across Domains
If your "consolidated topic" accidentally mixes domains (e.g., Order and Inventory events), a failure in one part can bring down another. Be explicit: consolidation only works within a single bounded context.

---

## The Benefits 
#### Guaranteed Message Ordering
The ability to ensure ordering between different message types is a huge advantage!

For example, with a single Order topic and `OrderId` as partition key, you eliminate the risk of consuming an `OrderShipped` message before an `OrderCreated` message. In systems where these messages are on their own topics, race condition scenarios could allow a consumer to receive an `OrderShipped` message for an Order it doesn't know exists yet, having to decide between being stuck with the inconsistent message or having to rely on a DLQ and Retry flows.

By leveraging Kafka's ordering guarantee within partitions, you can avoid these eventual consistency complexities altogether. 

#### Kafka Cluster Performance
Kafka clusters can suffer performance degradation as the number of topics grows, particularly due to the increase in the amount of partitions overall. Aiming to keep the total number of partitions in the low hundreds helps maintain optimal performance.

In an extreme scenario where there are many granular topics - topics with low-throughput where a single partition more than suffices - consolidating them into fewer coarse topics leads to less partitions being needed in the shared topic, when compared with the sum of partitions from individual topics. 

#### Reduced Cognitive Complexity
From a team perspective, managing dozens of related topics is a maintenance burden: schema coordination, cross-topic ordering logic, eventual consistency scenarios all amplify. A single topic per aggregate root (Order domain) reduces the mental model significantly. 
#### Guaranteed Message Ordering
The ability to ensure ordering between different message types is a huge advantage!

For example, with a single Order topic and `Orderld` as partition key, you eliminate the risk of consuming an `OrderShipped` message before an `OrderCreated` message. In systems where these messages are on it's own topics, race condition scenarios could allow a consumer to receive an `OrderShipped` message for an Order it doesn't know exists yet, having to decide between being stuck with the inconsistent message or having to rely on a DLQ and Retry flows.

By leveraging Kafka's ordering guarantee within partitions, you can avoid these eventual consistency complexities altogether. 

#### Kafka Cluster Performance
Kafka clusters can suffer performance degradation as the number of topics grows, particularly due to the increase in the amount of partitions overall. Aiming to keep the total number of partitions in the low hundreds helps maintain optimal performance.

In an extreme scenario where there are many granular topics - topics with low-throughput where a single partition more than suffices - consolidating them into fewer coarse topics leads to less partitions being needed in the shared topic, when compared with the sum of partitions from individual topics. 

## The Drawbacks & Trade-offs
#### Limited Filtering Capabilities
Consumers aren't able to filter out uninteresting messages, they must consume all messages in the topic and "do nothing" when handling those that aren't of interest.

This leads to resource waste, and it's important to consider the Consumer Hit rate - the frequency with which they process messages of interest. If it's too low and leading to relevant resource waste, consider splitting message types into their own topics.

The best scenario is when the message types within a topic have similar message volumes, making the hit rate even between consumers. 

#### Services Memory Consumption
When high-traffic topics are consolidated into one, the amount of partitions of the consolidated topic must scale to the much higher combined load.

A large number of partitions per topic results in more metadata for producers and consumers to manage, leading to increased memory consumption and coordination overhead.

---

## Observability & Debugging for Consolidated Topics

Consolidated topics require deliberate observability instrumentation. Standard metrics are not sufficient:

**Per-Message-Type Metrics** (Essential)
- Throughput (msgs/sec) broken down by message type
- Latency (p50, p99) per message type per consumer
- Error rate per message type
- Consumer hit rate per consumer (proportion of messages it actually processes)
- Commit lag per consumer per message type (exposes consumer starvation)

**Logging & Tracing** (Essential)
- Every consume operation logs the message type and a trace ID
- Errors include the message type and headers for DLQ routing
- Distributed tracing propagates across service boundaries, letting you follow order lifecycles from producer through all consumers

**Alerting Rules** (Essential)
- Alert on any poison-message pattern: consumer crash + rebalance loop on a specific message type
- Alert on per-message-type error rate exceeding threshold
- Alert on consumer hit rate below expected (exposes hidden filtering issues)

**Debugging Under Pressure** (Practice)
- Can you identify which message type is causing a consumer crash in < 5 minutes?
- Can you extract a single poison message to DLQ without blocking the entire topic?
- Can you replay a message type from a specific offset without replaying others?

If you cannot answer "yes" to all three questions, do not consolidate yet.

---

## Decision Framework: Should You Consolidate?

Use this framework to decide whether consolidation makes sense for your use case.

**Start here: Do you have hundreds of topics?**
- No → Stop here. Separation is simpler.
- Yes → Continue.

**Prerequisite Check: Can you satisfy all five prerequisites above?**
- No → Do not consolidate now.
- Yes → Continue.

**Question 1: Volume Symmetry**
Do all message types have roughly similar throughput (within 2–5x)?
- No → Consolidation will over-scale or under-utilize. Consider separate topics.
- Yes → Continue.

**Question 2: Domain Alignment**
Do all message types belong to the same bounded context (same team, same contract, same Ubiquitous Language)?
- No → Risk is too high. Keep them separate.
- Yes → Continue.

**Question 3: Ordering Dependency**
Do downstream consumers genuinely require ordering between message types?
- No → Separation is simpler.
- Yes → This is a genuine win for consolidation.

**Question 4: Consumer Overlap**
Do most consumers process multiple message types from this group?
- No (each consumer specializes in one message type) → Consolidation has low benefit and high cost.
- Yes → Consolidation reduces partition proliferation.

**If you answered Yes to all four questions, consolidation is likely worth the operational investment. Otherwise, stay with separation.**

---

## Migration & Rollback: Moving to and From Consolidation

**Consolidating Topics (Topic Merge)**

1. **Parallel Period (2–4 weeks)**
   - Create the new consolidated topic with a unique name: `orders-v2` (running alongside `order-created`, `order-processed`, etc.)
   - Deploy producers to write to both old and new topics (dual-write, using conditional logic: if `feature-flag: consolidate-orders` then publish to both)
   - Deploy consumers to read from the new topic in parallel, not yet applying writes
   - Validate that consumption lag and semantics match the old topics

2. **Cutover**
   - Redirect all new writes to the consolidated topic only
   - Let old topics drain (consumers finish processing)
   - Monitor poison-message rate and error rate on new topic closely for 24 hours

3. **Cleanup**
   - Delete old topics after retention window passes (at least 7 days)

**Splitting Consolidated Topics (Topic Split)**

If consolidation is failing (too much resource waste, poison messages affecting unrelated consumers, domain creep):

1. **Create new separate topics**: `orders-created`, `orders-processed`
2. **Dual-read period**: Consumers read from consolidated topic but write to separate topics
3. **Replay**: Reprocess the consolidated topic to populate the separate topics with full history
4. **Cutover**: Consumers switch to reading from separate topics only
5. **Cleanup**: Stop writing to consolidated topic; delete after retention

**Never do an instant cutover without a dual-read/dual-write period.**

---

## Counterexample: Where Consolidation Fails

**The Risk: OrderCreated + AuditLog**

Imagine consolidating `order-created` (high volume, critical path, low latency) with `audit-log` (voluminous, async, lower priority).

- **Volume asymmetry**: Audit logs are 10x higher throughput.
- **Domain mismatch**: Order events are from the Order domain; Audit is from a compliance domain.
- **Failure mode**: An audit-log producer misbehaves, starts emitting huge 10MB payloads. All Order consumers rebalance due to fetch timeout. Order SLA is breached.

**Result**: A consolidated topic that appeared to simplify matters made resilience worse.

**Lesson**: Consolidation only works when message types have similar throughput, the same owners, and the same SLO. 

## Conclusion 

Topic consolidation is **not free**. It trades partition proliferation for a shared failure surface and higher operational discipline.

Only consolidate when:
1. You have **all five prerequisites** in place (schema registry, observability, DLQ, bounded context, idempotency).
2. You answered **Yes to all four questions** in the decision framework (volume symmetry, domain alignment, ordering dependency, consumer overlap).
3. You have a **plan to migrate and rollback** without downtime.
4. Your team is **comfortable operating consolidated topics** with tight monitoring and poison-message protocols.

If you're consolidating to solve "too many topics" without these safeguards, you're trading a visible complexity problem for a hidden resilience problem. Both are real. Pick consciously.

**Before deploying consolidation to production**: 
- Run a chaos test: inject a poison message into your consolidated topic and confirm your DLQ, alerting, and consumer recovery work as documented.
- Validate per-message-type metrics in your observability platform.
- Document the bounded context, owners, and SLOs for this consolidated topic.
- Schedule a 30-day review: Is consolidation actually simpler, or did it shift the burden to operations?

If you decide to consolidate, I'd love to hear about your experience—especially what you learned about poison messages, domain alignment, and observability. 

## Further Reading
- [Martin Kleppman's blog post: "Should you put several event types in the same Kafka topic?"](https://martin.kleppmann.com/2018/01/18/event-types-in-kafka-topic.html): This was an inspiration for my team and influenced our system's refactoring
- [Confluent.io post: "How to Choose the Number of Topics/Partitions in a Kafka Cluster?"](https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster): Explains how the amount of partitions impacts a Kafka cluster performance
- ["Domain-Driven Design Distilled" book by Vaughn Vernon](https://www.goodreads.com/book/show/28602719-domain-driven-design-distilled): A must-read for any software engineer to get introduced to the challenges involved in managing the complexities of systems and how a Domain mindset can help tackle them.