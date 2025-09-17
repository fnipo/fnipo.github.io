---
title:  "Consumers/Producers Migrations Strategies"
date:   2025-09-16 00:00:00 +0000
categories: distributed-systems
tags: distributed-systems
header:
    og_image: /assets/consumers-producers-migrations-strategies.jpg
---

# Introduction
Migrating systems brings an entirely different set of challenges: doing it without downtime, keeping data consistency, and ensuring a seamless experience for customers in production.

This is often where the value of solid engineering practices becomes visible. Reliable testing builds confidence in avoiding regressions, while idempotency can be a great facilitator for a smooth migration.

In this article, I’ll cover common messaging-related migration scenarios that involve Kafka consumers and producers, along with their caveats.

# Scenario 1: The Happy Path
The happy path is when a contract changes in a backward-compatible way. In this case, you don’t need to declare a new version of the contract, and the same topic can continue to be used.

Because the change is backward-compatible, existing consumers won’t break when handling the new contract, and they can be upgraded at their own pace.

Common backward-compatible changes include:
- Adding a new field: outdated consumers simply ignore it.
- Adding new values to an enum: outdated consumers ignore them or fall back to defaults.
- Turning optional fields mandatory: outdated consumers are already coded to handle the field whether it has a value or is null.

```plantuml!
@startuml

!theme bluegray
skinparam QueueBackgroundColor #FFFFFF
skinparam QueueBorderColor #acacac
skinparam QueueFontColor #5a5a5a
skinparam NoteBackgroundColor Cornsilk
skinparam NoteBorderColor #acacac
skinparam NoteFontColor #5a5a5a
skinparam backgroundColor #FFFFFF
skinparam ArrowColor Gray
skinparam legendFontSize 7
left to right direction

legend top
🟦 New Component
🟥 Removed Component
endlegend

rectangle "Final State" #line:Gray {
    rectangle producer_d [
        **Producer**
    ]

    queue topic_d [
        **Topic**
    ]

    rectangle consumer_v2_d [
        **Consumer v2**
        (group: A)
    ]

    producer_d    -->     topic_d           :     v1
    topic_d       -->     consumer_v2_d     :     v1    
}

rectangle "Phase 2 - Consumer is Upgraded" #line:Gray {    
    rectangle producer_c [
        **Producer**
    ]

    queue topic_c [
        **Topic**
    ]

    rectangle consumer_v2_c #line:blue [
        **Consumer v2**
        (group: A)
    ]

    rectangle consumer_v1_c #line.dashed;line:red [
        **Consumer v1**
        (group: A)
    ]

    producer_c    -->            topic_c            :     v1
    topic_c       .[#red]->      consumer_v1_c      :     v1
    topic_c       -[#blue]->     consumer_v2_c      :     v1
}

rectangle "Phase 1 - Contract is Updated" #line:Gray {
    rectangle producer_b [
        **Producer**
    ]

    queue topic_b [
        **Topic**
    ]

    rectangle consumer_v1_b [
        **Consumer v1**
        (group: A)
    ]

    producer_b        -[#blue]->    topic_b            :       v1
    topic_b           -[#blue]->    consumer_v1_b      :       v1
}

rectangle "Initial State" #line:Gray {
    rectangle producer_a [
        **Producer**
    ]

    queue topic_a [
        **Topic**
    ]

    rectangle consumer_v1_a [
        **Consumer v1**
        (group: A)
    ]

    producer_a        -->       topic_a         :       v1
    topic_a           -->       consumer_v1_a   :       v1
}

@enduml
```{: .align-center}

In these cases, consumers aren’t required to upgrade immediately. For example, a service might not care about the new field and can continue ignoring it.

When consumers do upgrade, reusing the same consumer group ID ensures they resume exactly where the previous consumer left off. Kafka’s consumer group metadata tracks the last consumed offset, preventing both reprocessing and message loss.

# Scenario 2: Breaking Changes
Sometimes breaking changes to a contract are unavoidable. In this scenario, a new version of the contract must be introduced.

Typical breaking changes include:
- Deleting a mandatory field: outdated consumers fail to deserialize.
- Renaming a mandatory field: effectively the same as deleting the old one and adding a new one.
- Changing field types: outdated consumers deserialize incorrectly.

### Producing Both Versions

A common approach is to apply the [Parallel Change Pattern](https://martinfowler.com/bliki/ParallelChange.html), making producers emit both the old and new contracts to the same topic during a migration period.

For example, a producer may publish both versions of a message, `OrderCreatedV1` and `OrderCreatedV2`, to an `order-created` topic. Old consumers continue processing `OrderCreatedV1` messages while consumers are incrementally upgraded to handle `OrderCreatedV2` messages.

Eventually the producer switches to publishing only `OrderCreatedV2` messages, once all consumers are upgraded.

```plantuml!
@startuml

!theme bluegray
skinparam QueueBackgroundColor #FFFFFF
skinparam QueueBorderColor #acacac
skinparam QueueFontColor #5a5a5a
skinparam NoteBackgroundColor Cornsilk
skinparam NoteBorderColor #acacac
skinparam NoteFontColor #5a5a5a
skinparam backgroundColor #FFFFFF
skinparam ArrowColor Gray
skinparam legendFontSize 7
left to right direction

legend top
🟦 New Component
🟥 Removed Component
endlegend

rectangle "Final State" #line:Gray {
    rectangle producer_e [
        **Producer**
    ]

    queue topic_e [
        **Topic**
    ]

    rectangle consumer_v2_e [
        **Consumer v2**
        (group: A)
    ]

    producer_e    -->     topic_e           :     v2
    topic_e       -->     consumer_v2_e     :     v2    
}

rectangle "Phase 3 - Housekeeping" #line:Gray {
    rectangle producer_d [
        **Producer**
    ]

    queue topic_d [
        **Topic**
    ]

    rectangle consumer_v2_d [
        **Consumer v2**
        (group: A)
    ]

    producer_d        -->           topic_d            :       v2
    producer_d        .[#red]->     topic_d            :       v1
    topic_d           -->           consumer_v2_d      :       v2
    topic_d           .[#red]->     consumer_v2_d      :       v1
    
}

rectangle "Phase 2 - Consumer is Upgraded" #line:Gray {
    rectangle producer_c [
        **Producer**
    ]

    queue topic_c [
        **Topic**
    ]

    rectangle consumer_v2_c #line:blue [
        **Consumer v2**
        (group: A)
    ]

    rectangle consumer_v1_c #line.dashed;line:red [
        **Consumer v1**
        (group: A)
    ]

    producer_c        -->           topic_c            :       v2
    producer_c        -->           topic_c            :       v1
    topic_c           .[#red]->     consumer_v1_c      :       v2
    topic_c           .[#red]->     consumer_v1_c      :       v1
    topic_c           -[#blue]->    consumer_v2_c      :       v2
    topic_c           -[#blue]->    consumer_v2_c      :       v1
}

rectangle "Phase 1 - Contract v2 is Introduced" #line:Gray {
    rectangle producer_b [
        **Producer**
    ]

    queue topic_b [
        **Topic**
    ]

    rectangle consumer_v1_b [
        **Consumer v1**
        (group: A)
    ]

    producer_b        -[#blue]->    topic_b            :       v2
    producer_b        -->           topic_b            :       v1
    topic_b           -[#blue]->    consumer_v1_b      :       v2
    topic_b           -->           consumer_v1_b      :       v1
}

rectangle "Initial State" #line:Gray {
    rectangle producer_a [
        **Producer**
    ]

    queue topic_a [
        **Topic**
    ]

    rectangle consumer_v1_a [
        **Consumer v1**
        (group: A)
    ]

    producer_a        -->       topic_a         :       v1
    topic_a           -->       consumer_v1_a   :       v1
}

@enduml
```{: .align-center}

When the new consumer reuses the same consumer group, old and new consumers operate as [Competing Consumers](https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers).
For each pair of `v1` and `v2` messages, both messages share the same partition key, which Kafka ensures they are placed in the same partition and processed by the same consumer instance.

This guarantees that only the supported contract version of the assigned consumer instance is processed, so idempotency is not required for deduplication.

### ⚠️ Caveat: Replaying

Replaying such a topic in the future requires consumers to be able to handle all historic contract versions existing within the topic. And to do so idempotently, to avoid redundant processing of different versions of the same message.

### ⚠️ Caveat: Dual Writes

Read more in the [Dual Writes](https://felipenipo.com/distributed-systems/2022/06/17/solving-dual-writes-with-cdc-and-the-outbox-pattern.html) post.

Consider this scenario:
1. One version may be produced successfully while the other fails.
2. Retrying it can cause the previous successfully produced message version to be produced again to the topic.
3. Exactly-once guarantees may be compromised unless consumers are idempotent.

When dual writes become an issue, the alternative is a Producer Hard-switch strategy.

### Extra Challenge: Introducing a New Consumer Group

If a new consumer group is introduced, the system behaves as [Publisher-Subscriber](https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber).
In this mode, non-idempotent consumers will redundantly process both versions of messages. If exactly-once guarantees are required, consider either a Consumer Hard-switch or a Producer Hard-switch.

Also be mindful of deployment strategies like [Kubernetes Rolling Updates](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro), which can temporarily run old and new consumers in parallel, reproducing this scenario.

# Scenario 3: A New Topic Has to Be Introduced

Sometimes it isn't possible to keep multiple contract versions in the same topic, and a new topic must be created, bringing versioning to topics.

This is necessary when:
- The Kafka Schema Registry subject naming strategy disallows multiple contracts per topic.
- Consumers are external, unclear, or not under your control (e.g., third-party or customer integrations), making it hard to ensure they can handle multiple contract versions.
- The new schema represents a fundamentally different model, and the old topic is no longer suitable.
- The partition key changes. While its technically possible to change a topic's partition key, it will lead to messages being processed out-of-order, as previously produced messages won't be re-partitioned. A new topic is usually recommended.
- The partition count changes. Again, this is technically possible, but unless your system can tolerate out-of-order messages, a new topic should be created.

In these cases, versioning applies to topics themselves (e.g., `order-created` vs `order-created-v2`), and upgrading Consumers require a multi-topic migration plan.

### When Consumers are Idempotent

```plantuml!
@startuml

!theme bluegray
skinparam QueueBackgroundColor #FFFFFF
skinparam QueueBorderColor #acacac
skinparam QueueFontColor #5a5a5a
skinparam NoteBackgroundColor Cornsilk
skinparam NoteBorderColor #acacac
skinparam NoteFontColor #5a5a5a
skinparam backgroundColor #FFFFFF
skinparam ArrowColor Gray
skinparam legendFontSize 7
left to right direction

legend top
🟦 New Component
🟥 Removed Component
endlegend

rectangle "Final State" #line:Gray {
    rectangle producer_e [
        **Producer**
    ]

    queue topic_e [
        **Topic v2**
    ]

    rectangle consumer_v2_e [
        **Consumer v2**
        (group: A2)
    ]

    producer_e    -->     topic_e           :     v2
    topic_e       -->     consumer_v2_e     :     v2    
}

rectangle "Phase 3 - Housekeeping" #line:Gray {
    rectangle producer_d [
        **Producer**
    ]

    queue topic_v2_d [
        **Topic v2**
    ]

    queue topic_v1_d #line.dashed;line:red [
        **Topic v1**
    ]

    rectangle consumer_v2_d [
        **Consumer v2**
        (group: A2)
    ]

    rectangle consumer_v1_d #line.dashed;line:red [
        **Consumer v1**
        (group: A)
    ]

    producer_d        -->           topic_v2_d         :       v2
    producer_d        .[#red]->     topic_v1_d         :       v1
    topic_v2_d        -->           consumer_v2_d      :       v2
    topic_v1_d        .[#red]->     consumer_v1_d      :       v1
}

rectangle "Phase 2 - Consumer is Upgraded" #line:Gray {
    rectangle producer_c [
        **Producer**
    ]

    queue topic_v2_c [
        **Topic v2**
    ]

    queue topic_v1_c [
        **Topic v1**
    ]

    rectangle consumer_v2_c #line:blue [
        **Consumer v2**
        (group: A2)
    ]

    rectangle consumer_v1_c [
        **Consumer v1**
        (group: A)
    ]

    producer_c        -->           topic_v2_c         :       v2
    producer_c        -->           topic_v1_c         :       v1
    topic_v1_c        -->           consumer_v1_c      :       v1
    topic_v2_c        -[#blue]->    consumer_v2_c      :       v2
}

rectangle "Phase 1 - Topic v2 is Introduced" #line:Gray {
    rectangle producer_b [
        **Producer**
    ]

    queue topic_v2_b #line:blue [
        **Topic v2**
    ]

    queue topic_v1_b [
        **Topic v1**
    ]

    rectangle consumer_v1_b [
        **Consumer v1**
        (group: A)
    ]

    producer_b        -[#blue]->    topic_v2_b            :       v2
    producer_b        -->           topic_v1_b            :       v1
    topic_v1_b        -->           consumer_v1_b         :       v1
}

rectangle "Initial State" #line:Gray {
    rectangle producer_a [
        **Producer**
    ]

    queue topic_a [
        **Topic**
    ]

    rectangle consumer_v1_a [
        **Consumer v1**
        (group: A)
    ]

    producer_a        -->       topic_a         :       v1
    topic_a           -->       consumer_v1_a   :       v1
}

@enduml
```{: .align-center}

Idempotent consumers can consume from both topics simultaneously, using an idempotency key to deduplicate messages and enable a gradual migration.

Old consumers would still process messages from the old topic. And in the meanwhile, the new consumers will be already consuming from the new source.

This approach allows for dark launches to give confidence in the transition. For instance, the new consumer may run in parallel with feature flags to disable side effects, just logging outputs to compare side-by-side old vs. new flows.

Lastly, the old topic's consumers can be removed as part of a housekeeping effort.
The steps for this typically looks like this:
1. Phase out the old topic's producer so no new messages are added to the old topic.
2. Wait until the old topic dries out and all messages are consumed.
3. Remove the old topic's consumers.

### When Consumers Aren't Idempotent

Without idempotency, consumers must perform a hard switch. The challenge is ensuring the new consumer group starts processing from the equivalent offset of the old group, without reprocessing or skipping messages.

Read more in the Hard Switches post (coming soon...).

# Rollbacks

Rollbacks are as complex as migrations themselves.

For example, if a [Scenario 3](https://felipenipo.com/distributed-systems/2025/09/16/consumers-producers-migrations-strategies.html#scenario-3-a-new-topic-has-to-be-introduced) migration involves:
1. Switching producers to a new topic
2. Switching consumers to the new topic

Then a rollback requires the reverse:
1. Switching producers back to the old topic
2. Switching consumers back to the old topic

Delivery guarantees also apply in reverse. Before rolling consumers back, you may need to wait until the new topic is drained and all messages produced to it are processed, ensuring no loss.

# Conclusion

Idempotency is a powerful tool for simplifying migrations, particularly for high-available systems.

It allows for parallel processing, safe retries, gradual migrations, and more resilient rollbacks. Without it, migrations may require hard-switches, which involves a risky choreography of producer and consumer switches, usually leading to downtimes.

If you’re designing a high-available system today, bake idempotency in from the start and your future self will thank you when migrations inevitably arrive.