# Live iVeri TEST-environment suite (real gateway portal.host.iveri.com, Test App ID, test cards only).
import os, json, time, re, urllib.parse as up, urllib.request as ur
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:8787'
T={c['country']:c for c in json.load(open(os.path.join(os.path.dirname(__file__),'top10_test_profiles.json')))}
CC={'Zimbabwe':'ZW','United Kingdom':'GB','Australia':'AU','United States':'US','United Arab Emirates':'AE','South Africa':'ZA','Canada':'CA','Malawi':'MW','Ethiopia':'ET','Saudi Arabia':'SA'}
def prof(country):
    t=T[country]['test']; first,*rest=t['name'].split(' ')
    return dict(first=first,last=' '.join(rest),phone=t['phone'],email=t['email'],address=t['address'][:40],city=T[country].get('sample_city','')[:30],postal='',country=CC[country])
def get(p): return json.load(ur.urlopen(B+p))
def post(p,d=None):
    try: r=ur.urlopen(ur.Request(B+p,data=up.urlencode(d or {}).encode(),method='POST')); return r.status,r.read().decode(),r.url
    except Exception as e: return getattr(e,'code',0),(e.read().decode() if hasattr(e,'read') else str(e)),''
def order(ref): return next((o for o in get('/orders') if o['reference']==ref),None)
def intakes(ref): return [i for i in get('/odoo').get('intakes',[]) if i['intake_uuid']==ref]
def purl(stand,amount,country,manual=False):
    q=dict(stand=stand,amount=amount,max='500',**prof(country)); 
    if manual: q['manual']='1'
    return B+'/portal?'+up.urlencode(q)
R=[]
def rec(tc,country,case,expected,ok,obs,gw=''):
    R.append(dict(tc=tc,country=country,case=case,expected=expected,result='PASS' if ok else 'FAIL',gateway=gw,observed=obs)); print(R[-1],flush=True)
def last_ref(stand): return [o for o in get('/orders') if o['stand']==stand][-1]['reference']
def wait_settle(ref,secs=40):
    t0=time.time()
    while time.time()-t0<secs:
        o=order(ref)
        if o and o['state']!='initiated': return o
        time.sleep(1)
    return order(ref)
with sync_playwright() as p:
    br=p.chromium.launch()
    cards=[('L01','Zimbabwe','9901','4242424242424242','12/29','approved'),('L02','Zimbabwe','9902','2121212121212121','12/29','random decline'),
     ('L03','United Kingdom','9903','5454545454545454','12/29','timeout 9'),('L04','Australia','9904','4000000000000002','12/29','invalid 14'),
     ('L05','United Kingdom','9905','4070426536557386','12/29','3DS frictionless OK'),('L06','United States','9906','4069421358347845','12/29','3DS frictionless fail'),
     ('L07','Zimbabwe','9907','4070427646039018','12/29','3DS challenge'),('L08','United Arab Emirates','9908','4456530000001005','01/29','CyberSource OK'),
     ('L09','South Africa','9909','5189359787009697','12/29','3DS frictionless OK MC'),('L10','Canada','9910','4242424242424242','01/24','expired card')]
    import os
    cards=cards[int(os.environ.get('START','0')):]
    for tc,country,stand,card,exp,label in cards:
        pg=br.new_page(); pg.goto(purl(stand,'25.00',country)); pg.click('#pay-by-card'); pg.wait_for_selector('#CardPaymentParameters_CardNumber',timeout=30000)
        ref=last_ref(stand)
        pg.fill('#CardPaymentParameters_CardNumber',card); pg.fill('#CardPaymentParameters_CardExpiry',exp); pg.fill('#CardPaymentParameters_CardSecurityCode','123'); pg.fill('#CardPaymentParameters_CardHolderName',prof(country)['first']+' Test')
        if pg.is_disabled('#buttonCardPaymentSubmit'):
            msg=pg.inner_text('body'); hint=[l for l in msg.splitlines() if 'xpir' in l.lower() or 'invalid' in l.lower() or 'date' in l.lower()][:2]
            pg.screenshot(path=f'shots/{tc}.png'); o=order(ref)
            rec(tc,country,f'Card {label} ({card[:4]}..{card[-4:]}, exp {exp})','hosted page blocks submit; nothing reaches gateway; no record',o['state']=='initiated' and not intakes(ref),dict(ref=ref,state=o['state'],pay_button='disabled',page_hint=hint),gw='not submitted')
            pg.close(); continue
        pg.click('#buttonCardPaymentSubmit')
        o=wait_settle(ref,45); pg.screenshot(path=f'shots/{tc}.png')
        onpage=pg.inner_text('body')[:300].replace('\n',' ') if 'iveri' in pg.url else ''
        r=(o or {}).get('result',{}); st=o['state'] if o else None
        ok = (st=='error' and not intakes(ref)) or (st=='approved_pending_recon' and len(intakes(ref))==1) or (st in('declined','trylater') and not intakes(ref)) or (st=='initiated' and 'xpir' in onpage.lower())
        rec(tc,country,f'Card {label} ({card[:4]}..{card[-4:]}, exp {exp})','gateway outcome handled; Odoo intake only if AuthoriseInfo=0',ok,dict(ref=ref,state=st,odoo=len(intakes(ref)),page=pg.url.replace(B,'')[:40],hosted_msg=onpage[:120] if st=='initiated' else ''),gw=f"{r.get('Lite_Payment_Card_Status')} {r.get('Lite_Result_Description')}")
        pg.close()
    # Cancel
    pg=br.new_page(); pg.goto(purl('9901','30.00','Malawi')); pg.click('#pay-by-card'); pg.wait_for_selector('#buttonCardPaymentCancel'); ref=last_ref('9901'); pg.click('#buttonCardPaymentCancel'); o=wait_settle(ref,30); pg.screenshot(path='shots/L11.png')
    rec('L11','Malawi','Customer presses Cancel on iVeri page','cancelled, no record',o['state']=='cancelled' and not intakes(ref),dict(ref=ref,state=o['state'],browser_url=pg.url[:70]),gw=f"{o.get('result',{}).get('Lite_Payment_Card_Status')} {o.get('result',{}).get('Lite_Result_Description')}"); pg.close()
    # Forged approval
    pg=br.new_page(); pg.goto(purl('9902','40.00','Ethiopia',manual=True)); pg.click('#pay-by-card'); ref=pg.inner_text('#ref'); o=order(ref); pg.close()
    s,b,u=post('/iveri-return/success',{'LITE_PAYMENT_CARD_STATUS':'0','LITE_RESULT_DESCRIPTION':'Approved','LITE_MERCHANT_TRACE':o['trace'],'MERCHANTREFERENCE':ref,'LITE_ORDER_AMOUNT':'4000','LC_Nonce':o['nonce'],'LITE_ORDER_AUTHORISATIONCODE':'FAKE01'})
    o2=order(ref); rec('L12','Ethiopia','Forged "approved" POST for unpaid order (real AuthoriseInfo)','not recorded',o2['state']=='initiated' and not intakes(ref),dict(ref=ref,state=o2['state'],page=u.replace(B,'')[:60]))
    # Duplicate submit (same key twice)
    pg=br.new_page(); pg.goto(purl('9903','30.00','United Kingdom',manual=True))
    form={e:pg.get_attribute(f'input[name={e}]','value') for e in ['stand','amount','max','email','first','last','phone','address','city','postal','country','idempotencyKey']}
    pg.click('#pay-by-card'); ref1=pg.inner_text('#ref'); s,b,u=post('/init?manual=1',form); ref2=re.search(r'id="ref">([^<]+)',b).group(1); reused=re.search(r'id="reused">([^<]+)',b).group(1)
    n=len([o for o in get('/orders') if o['idempotencyKey']==form['idempotencyKey']])
    rec('L13','United Kingdom','Duplicate submit: Pay-by-card posted twice with same key','same order reused',ref1==ref2 and reused=='true' and n==1,dict(ref=ref1,second=ref2,reused=reused,orders=n)); pg.close()
    # Abandoned before paying
    pg=br.new_page(); pg.goto(purl('9904','15.00','Saudi Arabia')); pg.click('#pay-by-card'); pg.wait_for_selector('#CardPaymentParameters_CardNumber'); ref=last_ref('9904'); pg.close()
    _,s1,_=post('/sweep?older=0'); a=order(ref)['state']; _,s2,_=post('/sweep?older=0&abandon=0'); b2=order(ref)['state']
    rec('L14','Saudi Arabia','Browser closed on iVeri page before paying; sweep (real AuthoriseInfo)','open, then abandoned; no record',a=='initiated' and b2=='abandoned' and not intakes(ref),dict(ref=ref,first=a,after_timeout=b2))
    # Amount guards
    for tc,amt,country,why in [('L15','600.00','Zimbabwe','above outstanding $500'),('L16','0.50','United Kingdom','below $1 minimum')]:
        pg=br.new_page(); pg.goto(purl('9905',amt,country)); pg.click('#pay-by-card'); t=pg.inner_text('body'); pg.close()
        rec(tc,country,f'Amount {amt} ({why})','refused before iVeri','Amount' in t,dict(msg=t[:60]))
    br.close()
prev=json.load(open('live_results_part1.json')) if os.path.exists('live_results_part1.json') else []
R=prev+R
json.dump(R,open('live_results.json','w'),indent=1); print('PASS',sum(r['result']=='PASS' for r in R),'/',len(R))
