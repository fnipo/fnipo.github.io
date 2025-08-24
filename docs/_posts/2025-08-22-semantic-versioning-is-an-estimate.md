---
title:  "Semantic Versioning is Just an Estimate"
date:   2025-07-01 00:00:00 +0000
categories: software-engineering
tags: software-engineering
header:
    og_image: /assets/2025-08-22-semantic-versioning-is-an-estimate.jpg
---

Semantic Versioning became the industry standard for managing releases, following the pattern `MAJOR.MINOR.PATCH`:
- Patch is for safe bug fixes
- Minor is for safe backward-compatible changes
- Major increases are for breaking changes or significant milestones

It is helpful when weighing the risks of upgrading dependencies that are outside your control, whether from another team or from external.

SemVer also serves to better estimate technical debt. The further you drift apart from the latest major versions, the more likely you are to be exposed to bugs, security vulnerabilities, and missing features.

### Over-Promissing

However, at scale this promise starts to unravel.

As Google's Software Engineering book put it:
> "SemVer's numbers are provided by the maintainer as an estimate of how compatible the new version is, and we end up building all of our versioning logic on top of this shaky foundation, treating estimates as absolute".

When a maintainer pushes a new release and chooses this is a minor upgrade from `1.1.0` to `1.2.0`, is it guaranteed to be a safe and easy upgrade?

**No...**

Beyond the observable universe of things that a maintainer would consider when weighing how to bump the version, such as checking for breaking changes on contracts, there are subtle behavioral changes that may sneak in during "simple" changes:
- A change that affects performance, even in milliseconds, might impact time-sensitive consumers
- Changing the order in which results are returned might impact consumers unexpectedly relying on ordering

SemVer, like any estimation, is about **perceived** risks.

### Over-Constraining
Another face of the same problem, and a more obvious one, is that while a major bump signals a breaking change, it isn't guaranteed to break applications adopting it. The application might not be using the structure or behavior that changed.

### The Decision Process
In the real world, the decision whether a change warrants a major version bump or a minor one is subjective.
It might happen as an engineer's judgment call, or in a group meeting, collecting everyone's input to weigh the risks involved.

The discussion is often around:
- Who consumes this artifact? A critical system depending on it raises the stakes.
- How is it used? It might change a recently added parameter that no one is using yet.

For instance, inside an organization, teams may decide not to bump a major version when removing dead code, even when it's a breaking change, given that it's proven no one relies on it, to avoid unnecessary disruption.

Ultimately, it's always a risk-based decision.

# Hyrum's Law
>"With a sufficient number of users, every observable behavior of your system will be depended upon by someone.".

In real terms, at scale, you inevitably lose sight of all the ways your system is used. Any change will alter some hidden edge and break a consumer who was unexpectedly relying on that.

![](https://imgs.xkcd.com/comics/workflow.png){: .align-center}

Hyrum's Law was my main takeaway from reading Google's Software Engineering book.
It's a summary of hard-earned lessons only possible from operating systems on such a large scale.

(actually, I hope I've made a small contribution for the next revision!)
<blockquote class="twitter-tweet"><p lang="en" dir="ltr"><a href="https://t.co/1gUSxJPbWv">https://t.co/1gUSxJPbWv</a><br><br>Got to hear about <a href="https://twitter.com/hyrumwright?ref_src=twsrc%5Etfw">@hyrumwright</a> Hyrum&#39;s law the other day while reading the amazing Software Engineering at Google book, and no idea why this equally amazing XKCD is not in the book.<br><br>It&#39;s a fact of life: &quot;Everything that can be gamed will be gamed&quot;</p>&mdash; Felipe Nipo(@felipenipo) <a href="https://twitter.com/felipenipo/status/1536791609022590977?ref_src=twsrc%5Etfw">June 14, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

About the idea that an upgrade from 1.1.0 to 1.2.0 would be safe and easy as SemVer suggests... Hyrum's Law tells us otherwise.

Treat every update as risky, weigh the risk in your context, and depend on testing for a real compatibility guarantee.

# Automatic Patch Upgrades
A typical scenario when referencing a dependency is to lock Major and Minor versions while floating the Patch, e.g. `3.4.*`. This is motivated by the desire to receive bug and security fixes quickly, while still protecting against riskier changes.

When systems automatically pull in every latest patch version, they're effectively outsourcing their risk assessment to the dependency maintainers.

It's particularly risky with public artifacts. Don't be surprised to find out that, across open-source and vendors, the maintainers are often resource-constrained, operating with tight deadlines and limited testing.

# A Real-World Incident
I recently discovered a critical incident affecting Azure Cosmos DB users based on Docker, which began following a Patch release.

>[https://github.com/Azure/azure-cosmos-dotnet-v3/issues/5302](https://github.com/Azure/azure-cosmos-dotnet-v3/issues/5302).

Here is what happened:
- In July 2025, Azure Cosmos DB users running on Docker began experiencing intermittent connection failures after the `.NET 8.0.18` Patch release, which triggered an update on the corresponding `aspnet:8.0-alpine` Docker image to support the new .NET runtime version.
- In a .NET application, it's possible to enable automatic Patch upgrades by enabling the property `TargetLatestRuntimePatch=true`.
With this flag on, any .NET runtime patch release is automatically pulled in, including its corresponding Docker image.
- In a Dockerfile, the image is typically specified based on a Docker floating tag, such as `aspnet:8.0-alpine`. Microsoft manages these floating tags to point to a specific Alpine version they consider stable for that .NET release, so developers don't need to constantly update OS versions manually. In this case, the floating tag would resolve to an actual image version `aspnet:8.0.18-alpine3.22`.
- However, the Alpine `3.22` minor release introduced a major issue after upgrading its OpenSSL dependency. It caused clients based on that image to intermittently fail to connect to Cosmos DB under certain conditions involving multi-region setups and specific connection modes, causing a critical incident on Azure.

Any new deployment of a .NET application, based on this setup, would automatically point to the latest Patch version of the .NET 8 runtime, which would pull together the updated Docker image and automatically adopt the breaking change.

### Takeways
I prefer to err on the side of caution when it comes to dependency management and put safeguards in place to minimize risks.
At the same time, recognizing there's also risk in delaying the adoption of bug fixes.

Here are a few practices I've found effective:
- For public artifacts, maintain internal mirrors with a controlled lag to the latest public releases. It gives the ecosystem time to uncover early issues, while ensuring you're not indefinitely lagging behind.
- With internal artifacts, it's safer to float the Patch version, but rely on tooling to highlight dependencies drifting too far apart from the latest, and ensure diligence on the teams to upgrade them.
- Handle security patches through SCA vulnerability feeds to flag issues. Security teams should review flagged vulnerabilities, prioritize them, and apply hotfixes when necessary, addressing critical issues promptly.
- Avoid preview versions in production at all costs. Even if a preview release includes a tempting fix, it carries considerable risk of breaking something else.

Infrastructure maturity can allow some relaxation of these safeguards.
With Smoke tests, Canary releases, and Beta rings, new dependencies can be tried in production with limited exposure and self-recovering capabilities, making it possible to adopt updates more quickly without compromising reliability.

# Conclusion
Semantic Versioning is a valuable framework. It gives guidance for reasoning about changes. But it is not gospel. Version numbers are estimates, not guarantees, and treating them as the absolute truth is what leads to painful surprises.

For engineers, the lesson is clear: know the foundations you're building on, and understand the risks that come with them.