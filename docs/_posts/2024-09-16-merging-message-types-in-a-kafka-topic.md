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

## The Benefits 
#### Guaranteed Message Ordering
The ability to ensure ordering between different message types is a huge advantage!

For example, with a single Order topic and `Orderld` as partition key, you eliminate the risk of consuming an `OrderShipped` message before an `OrderCreated` message. In systems where these messages are on it's own topics, race condition scenarios could allow a consumer to receive an `OrderShipped` message for an Order it doesn't know exists yet, having to decide between being stuck with the inconsistent message or having to rely on a DLQ and Retry flows.

By leveraging Kafka's ordering guarantee within partitions, you can avoid these eventual consistency complexities altogether. 

#### Kafka Cluster Performance
Kafka clusters can suffer performance degradation as the number of topics grows, particularly due to the increase in the amount of partitions overall. Aiming to keep the total number of partitions in the low hundreds helps maintain optimal performance.

In an extreme scenario where there are many granular topics - topics with low-throughput where a single partition more than suffices - consolidating them into fewer coarse topics leads to less partitions being needed in the shared topic, when compared with the sum of partitions from individual topics. 

## The Drawbacks 
#### Limited Filtering Capabilities
Consumers aren't able to filter out uninteresting messages, they must consume all messages in the topic and "do nothing" when handling those that aren't of interest.

This leads to resource waste, and it's important to consider the Consumer Hit rate - the frequency with which they process messages of interest. If it's too low and leading to relevant resource waste, consider splitting message types into their own topics.

The best scenario is when the message types within a topic have similar message volumes, making the hit rate even between consumers. 

#### Resilience Considerations
Less isolation often translates to less resilience, and given messages aren't isolated on their own topic anymore, they can interfere with each other consumption.

In case a producer introduces a "poison pill" in the topic - a message that causes consumers to fail - it can affect all consumers from that topic, this is why it's important to ensure the topic belongs to a domain, following a Domain-Driven Design (DDD) approach.

If the message types are from different domains, it means the topic has a shared ownership between multiple bounded-contexts. This coupling can tie their availability together, meaning a failure in one part can cascade across the system and bring multiple parts of your system down together.

#### Services Memory Consumption
On another extreme scenario, when high-traffic topics are consolidated into one, the amount of partitions of the consolidated topic will be multiplied to scale to the much higher load.

A large number of partitions per topic results in more metadata for producers and consumers to manage, leading to increased memory consumption. 

## Conclusion 
Merging multiple message types into a single Kafka topic is a pattern that provides a stronger consistency guarantees, that can significantly reduce complexity and simplify maintenance, by leveraging Kafka's ordering guarantees and reducing the amount of moving parts. 

If you're currently grappling with an event-driven architecture, I challenge you to consider whether consolidating topics could benefit your system, think about which parts of your system benefits from eventual consistency, and which could be simplified with this approach.

If you decide to try it, I'd love to hear about your experience! 

## Further Reading
- [Martin Kleppman's blog post: "Should you put several event types in the same Kafka topic?"](https://martin.kleppmann.com/2018/01/18/event-types-in-kafka-topic.html): This was an inspiration for my team and influenced our system's refactoring
- [Confluent.io post: "How to Choose the Number of Topics/Partitions in a Kafka Cluster?"](https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster): Explains how the amount of partitions impacts a Kafka cluster performance
- ["Domain-Driven Design Distilled" book by Vaughn Vernon](https://www.goodreads.com/book/show/28602719-domain-driven-design-distilled): A must-read for any software engineer to get introduced to the challenges involved in managing the complexities of systems and how a Domain mindset can help tackle them.