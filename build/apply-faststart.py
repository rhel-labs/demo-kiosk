import os, shutil, tempfile
from qtfaststart import processor
media = 'content/media'
for f in sorted(os.listdir(media)):
    if not f.endswith('.mp4'):
        continue
    src = os.path.join(media, f)
    fd, tmp = tempfile.mkstemp(suffix='.mp4', dir=media)
    os.close(fd)
    try:
        processor.process(src, tmp)
        shutil.move(tmp, src)
        print(f'  faststart: {f}')
    except Exception as e:
        os.unlink(tmp)
        print(f'  skip {f}: {e}')
