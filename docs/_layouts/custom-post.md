---
layout: post
---

<section>
    <p class="reading-time" title="Estimated read time">
        ( :hourglass_flowing_sand: Reading time: 

        {% assign words = content | number_of_words %}
        {% if words < 160 %}
            1 min
        {% else %}
            {{ words | divided_by:180 }} mins
        {% endif %}
        )
    </p>
</section>

{{ content }}