"""縦8マス版フィールド画像の生成（旧705x1143・6段版と同じ配色/線ジオメトリを8段へ拡張）"""
from PIL import Image, ImageDraw, ImageFilter
import random
random.seed(20260711)

W,H=705,1473
CELL_W,CELL_H=128,165
PITCH_L,PITCH_T=32.5,62.5
COLS,ROWS=5,8
PITCH_R=PITCH_L+CELL_W*COLS   # 672.5
PITCH_B=PITCH_T+CELL_H*ROWS   # 1382.5
LINE=(255,255,255)
LW=4  # 線幅（旧画像実測 ~3-4px）

LIGHT=(9,193,6); DARK=(6,140,4); OUTER=(10,158,12)
im=Image.new('RGB',(W,H),OUTER)
d=ImageDraw.Draw(im)

# 外周（ピッチ外）に薄い縦板テクスチャ
for x in range(0,W,12):
    if random.random()<.5:
        d.rectangle([x,0,x+11,H],fill=(max(0,OUTER[0]-2),OUTER[1]-random.randint(0,10),OUTER[2]))

# チェッカー芝（(行+列)偶数=濃）
for r in range(ROWS):
    for c in range(COLS):
        col=DARK if (r+c)%2==0 else LIGHT
        x0=PITCH_L+c*CELL_W; y0=PITCH_T+r*CELL_H
        d.rectangle([x0,y0,x0+CELL_W-1,y0+CELL_H-1],fill=col)

# 芝の質感（低振幅ノイズをぼかして重ねる）
noise=Image.new('L',(W//3,H//3))
noise.putdata([random.randint(96,160) for _ in range((W//3)*(H//3))])
noise=noise.resize((W,H)).filter(ImageFilter.GaussianBlur(2))
im=Image.composite(im.point(lambda v:min(255,int(v*1.10))),im.point(lambda v:int(v*0.90)),noise)
d=ImageDraw.Draw(im)

def rect_line(x0,y0,x1,y1):
    d.rectangle([x0,y0,x1,y1],outline=LINE,width=LW)

cx=W/2
# ピッチ外枠
rect_line(PITCH_L-1,PITCH_T-1,PITCH_R+1,PITCH_B+1)
# ハーフウェイライン
mid=PITCH_T+CELL_H*ROWS/2
d.rectangle([PITCH_L,mid-LW/2,PITCH_R,mid+LW/2],fill=LINE)
# センターサークル＋スポット（旧実測 r=118）
R=118
d.ellipse([cx-R,mid-R,cx+R,mid+R],outline=LINE,width=LW)
d.ellipse([cx-7,mid-7,cx+7,mid+7],fill=LINE)

# PA/GAボックス・ペナルティスポット・アーク（上下対称。旧実測値と同寸）
PA_W,PA_D=386,165
GA_W,GA_D=171,58
SPOT=100.5   # ピッチ端からスポットまで（旧実測 163-62.5）
for top in (True,False):
    if top:
        yb=PITCH_T
        pa=[cx-PA_W/2,yb,cx+PA_W/2,yb+PA_D]; ga=[cx-GA_W/2,yb,cx+GA_W/2,yb+GA_D]
        sy=yb+SPOT
    else:
        yb=PITCH_B
        pa=[cx-PA_W/2,yb-PA_D,cx+PA_W/2,yb]; ga=[cx-GA_W/2,yb-GA_D,cx+GA_W/2,yb]
        sy=yb-SPOT
    rect_line(*pa); rect_line(*ga)
    d.ellipse([cx-6,sy-6,cx+6,sy+6],fill=LINE)
    # ペナルティアーク（センターサークルと同半径。弦=PAボックス線になる角度だけ描く）
    import math
    half=math.degrees(math.acos((PA_D-SPOT)/R))
    if top: a0,a1=90-half,90+half        # 下向きに膨らむ
    else:   a0,a1=270-half,270+half      # 上向きに膨らむ
    d.arc([cx-R,sy-R,cx+R,sy+R],a0,a1,fill=LINE,width=LW)

# ゴール（枠外の網。旧実測：幅106・奥行き31、白枠＋クロスハッチ）
GOAL_W,GOAL_D=106,31
for top in (True,False):
    if top: y0,y1=PITCH_T-LW/2-GOAL_D,PITCH_T-LW/2
    else:   y0,y1=PITCH_B+LW/2,PITCH_B+LW/2+GOAL_D
    x0,x1=cx-GOAL_W/2,cx+GOAL_W/2
    d.rectangle([x0,y0,x1,y1],fill=(6,118,8))
    step=7
    for k in range(int(x0-GOAL_D),int(x1)+GOAL_D,step):
        d.line([k,y0,k+GOAL_D,y1],fill=(12,170,14),width=1)
        d.line([k,y1,k+GOAL_D,y0],fill=(12,170,14),width=1)
    d.rectangle([x0,y0,x1,y1],outline=LINE,width=3)

im.save('/tmp/fieldgen/field8.png')
print('saved',im.size)
