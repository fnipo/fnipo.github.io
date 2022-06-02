---
layout: post
title:  "Top 5 distributed systems books/courses I saw to date"
date:   2022-05-22 18:52:58 +0100
categories: jekyll update
---

1. Udi Dahan's Advanced Distributed Systems Design course
https://particular.net/adsd


2. Illinois Cloud Computing Specialization
https://www.coursera.org/specializations/cloud-computing

I recommend particularly the Cloud Computing Concepts series, on part 1 you will deep dive on the fundamentals of distributed systems, and the internals of Cassandra one of the most complex databases,
by the end you will get to implement a C++ Gossip protocol yourself as the course project conclusion

The part 2 deep dives on distributed Consensus algorithms and you also get to implement a distributed key-value storage as the course project conclusion.

A lot of fun!

	
3. Domain-Driven Design Distilled by Vaughn Vernon

It is a great intro on some of the challenges of microservices, and uses DDD as a great tool to draw ownership boundaries between services.


4. Designing Data-Intensive Applications by Martin Kleppmann

THE book. If you want to deep dive on the fundamentals, this is the most comprehensive material.
You get to the details of consistency, data pipelines and partioning challenges and techniques to deal with them.
Not a page turner, it is >500 pages long, and dense, some chapters may read as a dense academic paper.


5. Building Microservices by Sam Newman

Great intro to microservices, goes from the basics and brush up on many practical concerns when operating on a microservices architecture.




You’ll find this post in your `_posts` directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run `jekyll serve`, which launches a web server and auto-regenerates your site when a file is updated.

Jekyll requires blog post files to be named according to the following format:

`YEAR-MONTH-DAY-title.MARKUP`

Where `YEAR` is a four-digit number, `MONTH` and `DAY` are both two-digit numbers, and `MARKUP` is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.

Jekyll also offers powerful support for code snippets:

{% highlight ruby %}
def print_hi(name)
  puts "Hi, #{name}"
end
print_hi('Tom')
#=> prints 'Hi, Tom' to STDOUT.
{% endhighlight %}

Check out the [Jekyll docs][jekyll-docs] for more info on how to get the most out of Jekyll. File all bugs/feature requests at [Jekyll’s GitHub repo][jekyll-gh]. If you have questions, you can ask them on [Jekyll Talk][jekyll-talk].

[jekyll-docs]: https://jekyllrb.com/docs/home
[jekyll-gh]:   https://github.com/jekyll/jekyll
[jekyll-talk]: https://talk.jekyllrb.com/
