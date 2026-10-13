from pathlib import Path
import fitz,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.verification-work'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome');page=b.new_page();page.goto((WORK/'student-print.html').as_uri());page.evaluate('()=>document.fonts.ready')
 page.evaluate('''()=>{const main=document.querySelector('main');const template=document.querySelector('.question');const math=template.querySelector('.katex').outerHTML;const header=main.querySelector('header');main.replaceChildren(header);header.querySelector('h1').textContent='A4 分页压力验收';
 for(let i=1;i<=8;i++){const q=document.createElement('section');q.className='print-module question';q.innerHTML='<div class="question-stem"><span class="question-number">'+i+'.</span><div><p>PAGE_START_'+i+' '+math+'。</p>'+Array.from({length:4},(_,j)=>'<p>完整题干第 '+(j+1)+' 行，保持同一道题的内容、条件和小问。</p>').join('')+'<p>PAGE_END_'+i+'</p></div></div><div class="writing-space" style="height:15mm"></div>';main.append(q);}
 const long=document.createElement('section');long.className='print-module question';long.innerHTML='<div class="question-stem"><span class="question-number">9.</span><div><p>LONG_START</p>'+Array.from({length:90},(_,j)=>'<p>长题续页检验第 '+(j+1)+' 行：内容应完整保留，不因为整题不跨页而被裁切。</p>').join('')+'<p>LONG_END</p></div></div>';main.append(long); }''')
 page.pdf(path=str(ROOT/'打印验收-分页压力.pdf'),prefer_css_page_size=True,print_background=True);b.close()
doc=fitz.open(ROOT/'打印验收-分页压力.pdf');texts=[p.get_text() for p in doc];checks=[]
for n in range(1,9):
 starts=[i for i,t in enumerate(texts) if f'PAGE_START_{n}' in t];ends=[i for i,t in enumerate(texts) if f'PAGE_END_{n}' in t];assert len(starts)==1 and starts==ends,(n,starts,ends)
checks.append('eight normal questions keep their starts and ends on the same page when avoiding breaks')
start=next(i for i,t in enumerate(texts) if 'LONG_START' in t);end=next(i for i,t in enumerate(texts) if 'LONG_END' in t);assert end>start
for n in range(1,91):assert f'第 {n} 行' in '\n'.join(texts),n
checks.append('oversized question naturally continues across pages and retains every line and its final marker')
assert all(abs(p.rect.width-595.28)<1 and abs(p.rect.height-841.89)<1 for p in doc);checks.append('all stress-test pages are A4')
for i in sorted(set([0,start,end])):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(str(ROOT/f'打印分页验收-第{i+1}页.png'))
result={'passed':len(checks),'pages':len(doc),'checks':checks,'normalQuestions':8,'longQuestionPages':[start+1,end+1],'renderedPages':sorted(set([1,start+1,end+1]))};(ROOT/'打印分页验收.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
