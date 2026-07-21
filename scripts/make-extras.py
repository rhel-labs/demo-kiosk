import tarfile, os

WORKDIR = "/tmp"
MEMBERS = [
    "scripts",
    "app/faqs",
    "content/faqs",
    "AUTHORING.md",
    "demo-kiosk.container",
    "package.json",
    "start.sh",
]

with tarfile.open(os.path.join(WORKDIR, "extras.tar.gz"), "w:gz") as tf:
    for member in MEMBERS:
        tf.add(os.path.join(WORKDIR, member), arcname=member, filter=None)
