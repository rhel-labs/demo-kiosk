// AUTO-GENERATED — do not edit directly.
// Source:    content/faqs/*.yaml
// Generator: build/build-faqs.py
// Generated: 2026-04-15 21:34 UTC
//
// To add, remove, or reorder cards edit the .yaml files in content/faqs/
// then run:  python3 build/build-faqs.py

FAQ.register({
  id:      "q01-what-is-this",
  title:   "What is this product?",
  summary: "A quick visual overview of what we do and who it\u0027s for.",
  enabled: true,
  demo: {
    type: "image-text",
    image:   "content/media/placeholder-overview.png",
    caption: "Replace this with a screenshot or diagram that shows your product at a glance. Update the caption field in content/faqs/q01-what-is-this.yaml to describe what is shown.\n",
  },
});

FAQ.register({
  id:      "q02-installation",
  title:   "How do I install it?",
  summary: "Watch a short walkthrough of the installation process from start to finish.",
  enabled: true,
  demo: {
    type: "video",
    src:  "content/media/placeholder-installation.mp4",
  },
});

FAQ.register({
  id:      "q03-configuration",
  title:   "How do I configure it?",
  summary: "A terminal walkthrough of the key configuration options.",
  enabled: true,
  demo: {
    type: "asciinema",
    src:  "content/media/build.cast",
  },
});

FAQ.register({
  id:      "q04-troubleshooting",
  title:   "What do I do if something goes wrong?",
  summary: "Step-by-step slides covering common issues and how to diagnose them.",
  enabled: true,
  demo: {
    type: "slides",
    src:  "content/media/placeholder-configuration.pdf",
  },
});

FAQ.register({
  id:      "q05-getting-help",
  title:   "Where can I get more help?",
  summary: "Resources, documentation, and contact options available to you.",
  enabled: true,
  demo: {
    type: "external-url",
    url:              "https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/hummingbird",
    long_description: "Find documentation, release notes, and support resources for Red Hat Enterprise Linux.\n\n- Product documentation and guides\n- Knowledgebase articles and solutions\n- Contact Red Hat support\n",
  },
});

FAQ.register({
  id:      "q06-arcade-demo",
  title:   "See it in action \u2014 interactive demo",
  summary: "Step through the product yourself with a hands-on interactive walkthrough.",
  enabled: true,
  demo: {
    type: "arcade",
    url:          "https://demo.arcade.software/yjjKM29mmJB4eczCA9sg?embed=",
    title:        "RHEL-CY25Q2- Command Line Assistant",
    aspect_ratio: "56.25%",
  },
});

FAQ.register({
  id:      "q07-lab-demo",
  title:   "Try it yourself \u2014 hands-on lab",
  summary: "Get hands-on experience in a live RHEL environment, no installation required.",
  enabled: true,
  demo: {
    type: "lab",
    url:              "https://zero.rhdp.net/lab/zt-rhelbu.zt-customize-crypto-policy.prod",
    long_description: "Walk through customizing the cryptographic policy on a live Red Hat Enterprise Linux system.\n\nYou will learn how to:\n- View and change the system-wide crypto policy\n- Apply a custom policy submodule\n- Verify the changes take effect\n\nA Red Hat account is required to access the lab environment.\n",
    duration:         "15 minutes",
  },
});
