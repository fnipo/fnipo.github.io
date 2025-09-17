var store = [{
        "title": "Partial execution: At-most-once vs. At-least-once Deliveries",
        "excerpt":"A workflow inside a microservice typically writes stuff to a database and produces a message or API request to another service. What if some infrastructure component goes down during the workflow execution and it can’t complete? The beginning of the workflow may execute, but some parts at the end may...","categories": ["distributed-systems"],
        "tags": ["distributed-systems"],
        "url": "/distributed-systems/2022/06/16/partial-execution-at-most-once-vs-at-least_once-deliveries.html",
        "teaser": null
      },{
        "title": "Solving Dual-writes: Change Data Capture, The Outbox Pattern, and Event Sourcing",
        "excerpt":"The dual-writes pattern is anytime a workflow has to write to two or more storages while not leveraging any transaction isolation. This is typically used on systems that can’t compromise availability with locking strategies such as Two Phase Commit. As explained in the Partial execution: At-most-once vs. At-least-once Deliveries post,...","categories": ["distributed-systems"],
        "tags": ["distributed-systems"],
        "url": "/distributed-systems/2022/06/17/solving-dual-writes-with-cdc-and-the-outbox-pattern.html",
        "teaser": null
      },{
        "title": "Merging Message Types in a Kafka Topic",
        "excerpt":"When I first started designing event-driven systems I followed the guideline of separating each message type into its own dedicated topic, it seemed like a foolproof way to ensure clarity and a maintainable system. As I encountered systems with hundreds of kafka topics, I began to see some downsides, the...","categories": ["distributed-systems"],
        "tags": ["distributed-systems"],
        "url": "/distributed-systems/2024/09/16/merging-message-types-in-a-kafka-topic.html",
        "teaser": null
      },{
        "title": "Semantic Versioning is Just an Estimate",
        "excerpt":"Semantic Versioning became the industry standard for managing releases, following the pattern MAJOR.MINOR.PATCH: Patch is for safe bug fixes Minor is for safe backward-compatible changes Major increases are for breaking changes or significant milestones It is helpful when weighing the risks of upgrading dependencies that are outside your control, whether...","categories": ["software-engineering"],
        "tags": ["software-engineering"],
        "url": "/software-engineering/2025/07/01/semantic-versioning-is-just-an-estimate.html",
        "teaser": null
      },{
        "title": "Consumers/Producers Migrations Strategies",
        "excerpt":"Introduction Migrating systems brings an entirely different set of challenges: doing it without downtime, keeping data consistency, and ensuring a seamless experience for customers in production. This is often where the value of solid engineering practices becomes visible. Reliable testing builds confidence in avoiding regressions, while idempotency can be a...","categories": ["distributed-systems"],
        "tags": ["distributed-systems"],
        "url": "/distributed-systems/2025/09/16/consumers-producers-migrations-strategies.html",
        "teaser": null
      },]
