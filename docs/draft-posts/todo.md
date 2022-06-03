TODO: Use https://github.com/jeffreytse/jekyll-deploy-action?

TODO: trim posts to 5 minutes max

# How to ensure consistency with microservices
    https://medium.com/@jnovino/scaling-microservices-jet-com-4a5bf0eaad92
    https://medium.com/@jnovino/microservices-to-workflows-the-evolution-of-jets-order-management-system-9e5669bd53ab
    - At most once
    - At least once
    - Exactly once:
        - Outbox pattern (debemziun)
        - Log tailling pattern / Change feed processor
        - Streaming deduplication
    - Outside bounded-context:
        - Event-carried state transfer

# The problem of cross partition queries on sharded database
    - Partition logic issues
    - Cosmos logical partitions RU limit

# Hot partitions
    - 1 read-view per 1 workflow, eventual consistent, CQRS

# Event sourcing
    - Append only database model
    - Write path, append-only by default
    - Read path:
        - Synchronous compaction on the fly mitigated with Snapshots
        - Asynchronous compaction to read-view with CQRS
    - Audit log benefits
    - When it is overkill
    - "Eventsourcing uses storage as a way of communication, it solves storage and messaging for you" DDD author

# Data projections or Derived Data pattern
    - microservices don't share database, challenges with that
    - What it is, and its benefits
        Propagate data between services without coupling
        Each service keeps optimized views locally (kinda anti-corruption layer pattern)
    - When to use it vs. sync API calls

# Simplicity lead design
    - Simple vs Easy
    - Cognitive driven design, to reduce cognitive load on developers, the most expensive resource
    - Company design on cognitive load, using platform teams to scale a company
    - "The real enemy to programming is complexity" Venkat



# Partial execution and idempotency
    - How to handle partial execution and retry safely
    - Duplicated message consumption, due to duplicated producing, kafka infra issues or batch processing issues

# Kafka topic per event vs Kafka topic per context
    - Symetric vs Assymetric load and computation

# Data that lives inside, data that lives outside
    - Events/State vs. Messages, and decoupling
    - Data-mesh and discoverability

# Domain driven design
    - Ubiquituous language and allowing design by PMs
    - Modeling real world events, focus on the workflows not the entities
    - Benefits on keep what changes together, together!
    - Cons, very coupled and optimized to the set of workflows, redesigns are needed as workflows changes (Show redesign effor diagram).
        "ETTO principle = A solution cannot be efficient and thorough at the same time, solutions are efficient in a specific context as there are tradeoffs involved"
    - "Design service boundaries in such a way most of its business transactions stay within the boundaries" Udi
    - "When designing boundaries, even for experienced people, there is a server that you are bumping around in the dark trying to guess what the shape of the world is like" Udi
    - "any model serving all purposes that gets passed everywhere is asking for a mess" Ruben
    - "Keep what changes together, together" Nipo
    "Data models are perharps the most important part of developing software, because they have such a profound effect: not only on how the software is written, but also on how we think about the problem that we are solving" Martin

# Cosmos DB session consistency mode
    - Failover data loss scenario
    - read-your-own-writes guarantee within single cosmos connection client

# Contention on database
    - 429 Conflict errors
    - Redesign solutions (i.e. array with document, multiple agents populating the array)

# Kafka partitions
    - Partition assignment process

# Optimistic lock with etag (i.e. on Cosmos)

# Requests traffic patterns
    - Predictitable bell-shaped curve and pre-scaling / auto-scaling
    - Thunder herd pattern and elasticity
    - Containers vs VMs for elasticity

# Why distributed systems are hard
    - Illinois course introduction, how everything is complicated in case of failure without central commander, needing consensus and organical, like the internet
    - Explain distributed systems with Gossip protocol
    - The benefits of distributed systems
    - The big ball of mud, that has all the cons of a distributed system for none of the advantages

# Time, Clocks and the Ordering of Events in a Distributed System

# Partial Failover
    - Failover only the messaging platform, or only the database, sometimes an specific component is having a hard time