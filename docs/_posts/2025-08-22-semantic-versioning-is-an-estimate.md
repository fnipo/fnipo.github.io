---
title:  "Semantic Versioning is an Estimate"
date:   2025-07-01 00:00:00 +0000
categories: software-engineering
tags: software-engineering
header:
    og_image: /assets/deliveries.jpg
---

Semantic Versioning became the industry standard for managing releases, following the pattern `MAJOR.MINOR.PATCH`:
- Patch is for safe bug fixes
- Minor is for safe backward-compatible changes
- Major increases are for breaking changes or significant milestones

It is particularly helpful when weighting the risks on upgrading dependencies that are outside your control, whether from another team or from external. It provides some level of confidence about what to expect when upgrading.

SemVer also serves to better estimate technical debt, the further you drift apart from the latest major versions, the more likely you are exposed to bugs, security vulnerabilities, and missing features.

### Over-Promissing

However, at scale this promisse starts to unravel.

As the Google's Software Engineering book put it:
> "SemVer's numbers are provided by the maintainer as an estimate of how compatible the new version is, and we end up building all of our versioning logic on top of this shaky foundation, treating estimates as absolute".

When a maintainer pushes a new release, and choose this is a minor upgrade from `1.1.0` to `1.2.0`, is it guaranteed to be a safe and easy upgrade?

**No...**

Beyond the observable universe of things that a maintainer would consider to weight how to bump the version, such as checking for breaking change on contracts, there are subtle behavioral changes that may sneak in during "simple" changes:
- A change that affects performance, even in milliseconds, might impact time-sensitive consumers
- Changing the order in that results are returned, might impact consumers unexpectedly relying on ordering

SemVer, as any estimation, is about **perceived** risks.

> “Unknown unknowns are the nemesis of software systems.” Mark Richards

### Over-Constraining
Another face of the same problem, and a more obvious one, is that while a major bump signals a breaking change, it isn't guaranteed to break applications adopting it. The application might not be using the structure or behavior that changed.

I prefer to read major bumps as "This might break your application", to better reason about it.

### The Decision Process
In the real world, the decision if a change warranties a major version bump or a minor one is subjective. It might happen as an engineer judgment call, or in a group meeting similar to a poker planning session, collecting everyone's input to weight the risks involved.

The discussion is often around:
- Who consumes this artifact? A critical system depending on it raises the stakes.
- How is it used? It might change a recently added parameter that no one is using yet

For instance, inside an organization, teams may decide to not bump a major version when removing dead-code even when it's a breaking change, given it's proven no one relies on it, to avoid unnecessary disruption. Which is much easier in a controlled environment than in the open world.

Ultimately, it’s always a risk-based decision.

# Hyrum's Law
>“With a sufficient number of users, every observable behavior of your system will be depended upon by someone.”.

In real terms, at scale you inevitably lose sight of all the ways your system is used. It gets to a point where any change will alter some hidden edge and break a consumer that was unexpectedly relying on that.

![](https://imgs.xkcd.com/comics/workflow.png){: .align-center}

Hyrum's Law was my main takeaway from reading the Google's Software Engineering book, it's a summary of hard-earned lessons only possible from operating systems in such large-scale. In general, it's a great book to get an insider view of challenges typical of Big Techs.

(actually, I hope I've made a small contribution for a next revision!)
<blockquote class="twitter-tweet"><p lang="en" dir="ltr"><a href="https://t.co/1gUSxJPbWv">https://t.co/1gUSxJPbWv</a><br><br>Got to hear about <a href="https://twitter.com/hyrumwright?ref_src=twsrc%5Etfw">@hyrumwright</a> Hyrum&#39;s law the other day while reading the amazing Software Engineering at Google book, and no idea why this equally amazing XKCD is not in the book.<br><br>It&#39;s a fact of life: &quot;Everything that can be gamed will be gamed&quot;</p>&mdash; Felipe Nipo(@felipenipo) <a href="https://twitter.com/felipenipo/status/1536791609022590977?ref_src=twsrc%5Etfw">June 14, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

So, about the idea that an upgrade from `1.1.0` to `1.2.0` would be safe and easy as SemVer suggests, Hyrum's Law tell us otherwise, particularly when operating at scale.

You should treat every update as risky, weight the risk in your context, and depend on testing for real compatibility guarantee.

# Automatic Patch upgrades
A common scenario when referencing a dependency, is to lock Major and Minor versions while floating the Patch, e.g. `3.4.*`. This is motivated by the desire to receive bug and security fixes quickly, while still protecting against riskier changes, trying to strike a balance between both.

In practice, when systems automatically pulls in every latest patch version, what they’re actually doing is outsourcing their risk assessment to the dependency maintainers. This is particularly risky with public artifacts. Don't be surprised to find out that, across open-source and vendors, the maintainers are often resource constrained, operating with tight deadlines and limited testing.

# Thoughts on a Real-World Incident
I recently found out about a critical incident that affected Azure Cosmos DB users based on Docker, where it all started after a Patch release.

>[Azure Cosmos DB GitHub issue #5302](https://github.com/Azure/azure-cosmos-dotnet-v3/issues/5302).

Here is what happened:
- In July 2025, Azure Cosmos DB users began experiencing intermittent connection failures after the `.NET 8.0.18` Patch release, that trigerred an update on the corresponding `aspnet:8.0-alpine` Docker image.
- In a .NET application, it’s possible to enable automatic Patch upgrades by enabling the property `TargetLatestRuntimePatch=true`.
With this flag on, any .NET runtime patch release is automatically pulled in, including its corresponding Docker image.
- On a DockerFile, the image is tipically specified based on a docker floating tag, such as `aspnet:8.0-alpine`. Microsoft manages these floating tags to point to a specific Alpine version they consider stable for that .NET release, so developers don’t need to constantly update OS versions manually. In this case, the floating tag would resolve to an actual image version `aspnet:8.0.18-alpine3.22`.
- However, the Alpine `3.22` minor release introduced a major issue, after upgrading an OpenSSL dependency from `3.3.3` to `3.5.0`. That seemingly small update caused clients based on that image to interminttently fail to connect to Cosmos DB under certain conditions involving multi-region setups and specific connection modes, causing a critical incident on Azure.

Any new deployment of a .NET docker application, would automatically point to the latest Patch version of the .NET 8 runtime, which would pull together the updated docker image and automatically adopt the breaking change.

### Takeways
I particularly prefer to err on the side of caution when it comes to dependency management, and put safeguards in place to minimize risks.
At the same time, recognizing there’s also risk in delaying the adoption of bug fixes.

Here are a few practices I’ve found effective:
- For public artifacts, maintain internal mirrors with a controlled lag to the latest public releases. It gives the ecosystem time to uncover early issues, while ensuring you’re not indefinitely lagging behind.
- With internal artifacts it's safer to float the Patch version, but rely on tooling to highlight dependencies drifting too far apart from latest, and ensure dilligence on the teams to upgrade them.
- Handle security patches through security feeds to flag issues. Security teams should review flagged vulnerabilities, prioritize them, and apply hotfixes when necessary. This ensures critical issues are addressed promptly.
- Avoid preview versions in production at all costs. Even if a preview release includes a tempting fix, it carries considerable risk of breaking something else.

Infrastructure maturity can allow some relaxation of these safeguards.

With Smoke tests, Canary releases and Beta rings, new dependencies can be tried in production with limited exposure and self-recovering capabilities, making it possible to adopt updates more quickly without compromising reliability.

# Conclusion
Semantic Versioning is a useful framework, it gives guidance for reasoning about changes. But it is not gospel. Version numbers are estimates, not guarantees, and treating them as absolute truth is what leads to painful surprises.

For engineers, the lesson is clear: know the foundations you’re building on, and understand the risks that come with them.