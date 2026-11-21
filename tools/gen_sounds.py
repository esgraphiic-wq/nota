import wave, struct, math, random
SR=11025
def note(f,d,shape="sine",vol=0.5,dec=6):
    n=int(SR*d); out=[]
    for i in range(n):
        t=i/SR; env=math.exp(-dec*t/d) if dec else 1
        a=min(1,i/(SR*0.005))*env
        if shape=="sine": v=math.sin(2*math.pi*f*t)
        elif shape=="square": v=1 if math.sin(2*math.pi*f*t)>0 else -1
        elif shape=="bell": v=math.sin(2*math.pi*f*t)+0.5*math.sin(2*math.pi*f*2.76*t)+0.25*math.sin(2*math.pi*f*5.4*t)
        else: v=math.sin(2*math.pi*f*t)
        out.append(v*a*vol)
    return out
def sil(d): return [0]*int(SR*d)
def mix(seq,total):
    buf=[0.0]*int(SR*total)
    for start,s in seq:
        o=int(start*SR)
        for i,v in enumerate(s):
            if o+i<len(buf): buf[o+i]+=v
    m=max(1,max(abs(x) for x in buf)); return [x/m*0.9 for x in buf]
def save(name,buf):
    w=wave.open("sounds/%s.wav"%name,"w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h",int(max(-1,min(1,x))*32767)) for x in buf)); w.close()
T=40
# bell: repeated bell strikes
save("bell",mix([(k*1.5,note(880,1.4,"bell",0.6,5)) for k in range(int(T/1.5))],T))
# beep: classic digital alarm, 4 beeps then pause
seq=[]
for r in range(int(T/3)):
    for b in range(4): seq.append((r*3+b*0.22,note(1760,0.12,"square",0.35,0)))
save("beep",mix(seq,T))
# melody: rising phrase
mel=[523,659,784,1047,784,659]; seq=[]
for r in range(int(T/4)):
    for i,f in enumerate(mel): seq.append((r*4+i*0.4,note(f,0.5,"sine",0.5,4)))
save("melody",mix(seq,T))
# chime: soft two-tone
seq=[]
for r in range(int(T/2.4)): seq+= [(r*2.4,note(1319,1.0,"bell",0.45,5)),(r*2.4+0.5,note(988,1.4,"bell",0.45,5))]
save("chime",mix(seq,T))
# siren: loud sweep
buf=[]; ph=0
for i in range(SR*T):
    t=i/SR; f=700+500*math.sin(2*math.pi*0.9*t); ph+=2*math.pi*f/SR; buf.append(0.7*math.sin(ph))
save("siren",buf)
