from PIL import Image, ImageDraw
import random, os
w,h=1200,630
img=Image.new('RGB',(w,h))
pixels=img.load()
for x in range(w):
    for y in range(h):
        r=int(40 + 40*(x/w) + random.randint(0,30))
        g=int(80 + 80*(y/h) + random.randint(0,30))
        b=int(150 + 60*((x+y)/(w+h)) + random.randint(0,30))
        pixels[x,y]=(max(0,min(255,r)),max(0,min(255,g)),max(0,min(255,b)))
draw=ImageDraw.Draw(img)
for i in range(6):
    y=50+i*90
    draw.rounded_rectangle((80,y,1120,y+60),radius=20,fill=(255,255,255,40))
img.save('random-banner.png','PNG')
print('generated random-banner.png',os.path.getsize('random-banner.png'))
