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
    "title": "About",
    "excerpt":"This is the base Jekyll theme. You can find out more info about customizing your Jekyll theme, as well as basic Jekyll usage documentation at jekyllrb.com You can find the source code for Minima at GitHub: jekyll / minima You can find the source code for Jekyll at GitHub: jekyll...","url": "https://fnipo.github.io/about/"
  }]
