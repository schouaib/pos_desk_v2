import { useState, useRef, useEffect } from 'preact/hooks'

const TERMS_ACCEPTED_KEY = 'ciposdz_terms_accepted_v1'

export function isTermsAccepted() {
  return localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true'
}

export function TermsModal({ onAccept }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [checked, setChecked] = useState(false)
  const scrollRef = useRef()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const threshold = 100
      if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
        setScrolledToBottom(true)
      }
    }
    el.addEventListener('scroll', onScroll)
    // Check if content fits without scroll
    if (el.scrollHeight <= el.clientHeight + 50) setScrolledToBottom(true)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function handleAccept() {
    localStorage.setItem(TERMS_ACCEPTED_KEY, 'true')
    onAccept()
  }

  return (
    <div class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-base-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">
        {/* Header */}
        <div class="p-5 border-b border-base-300 flex items-center gap-3 shrink-0">
          <div class="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <svg class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div>
            <h2 class="font-bold text-lg">شروط وأحكام الاستخدام</h2>
            <p class="text-xs text-base-content/50">يجب قراءة والموافقة على الشروط قبل المتابعة</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} class="overflow-y-auto flex-1 p-5 text-sm leading-relaxed space-y-4">
          <div class="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm">
            <p class="font-bold text-warning mb-1">تنبيه هام</p>
            <p class="text-base-content/80">هذه الاتفاقية تمثل عقدًا قانونيًا ملزمًا بين المطور <strong>Chouaib SEGHIER</strong> والمستخدم. يُرجى قراءة جميع البنود بعناية.</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">المادة 2: طبيعة البرنامج</h3>
            <p>البرنامج هو أداة تقنية محايدة لإدارة عمليات البيع والمخزون فقط. لا يُعتبر المطور بائعًا أو شريكًا تجاريًا أو ضامنًا للمستخدم بأي شكل من الأشكال.</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">المادة 3: حماية الملكية الفكرية</h3>
            <p>هذا البرنامج محمي بموجب الأمر رقم 03-05 المتعلق بحقوق المؤلف والاتفاقيات الدولية. جميع الحقوق محفوظة حصريًا للسيد Chouaib SEGHIER. يُحظر النسخ أو التعديل أو التوزيع أو الهندسة العكسية.</p>
          </div>

          <div>
            <h3 class="font-bold text-error mb-2">المادة 5: إخلاء كامل للمسؤولية — النشاط التجاري</h3>
            <p class="mb-2">يُخلي السيد Chouaib SEGHIER مسؤوليته إخلاءً كاملًا، مطلقًا، نهائيًا، وغير قابل للرجوع عن أي وكل استخدام للبرنامج. المستخدم هو المسؤول الوحيد عن:</p>
            <ul class="space-y-1 pr-4 text-xs">
              <li>• مشروعية جميع المنتجات والخدمات المباعة</li>
              <li>• الامتثال لجميع القوانين التجارية والضريبية والجمركية</li>
              <li>• الحصول على جميع التراخيص والتصاريح اللازمة</li>
              <li>• صحة الأسعار والمعلومات المُدخلة</li>
            </ul>
            <p class="mt-2 text-xs text-error font-semibold">يُخلي المطور مسؤوليته عن: بيع منتجات مقلدة أو محظورة أو منتهية الصلاحية، التهرب الضريبي، انتهاك حقوق الملكية الفكرية للغير، أي ممارسات تجارية مخالفة للقانون، وأي أضرار تلحق بالمستهلكين أو الأطراف الثالثة.</p>
          </div>

          <div>
            <h3 class="font-bold text-error mb-2">المادة 6: إخلاء المسؤولية — البيانات</h3>
            <p>المستخدم مسؤول عن حماية بياناته والنسخ الاحتياطي. لا يتحمل المطور أي مسؤولية عن فقدان البيانات أو تلفها أو سرقتها أو اختراقها أو انقطاع الخدمة لأي سبب كان.</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">المادة 7: البرنامج "كما هو"</h3>
            <p>يُقدَّم البرنامج "كما هو" (AS IS) و"حسب التوفر" (AS AVAILABLE) و"مع جميع العيوب" (WITH ALL FAULTS) دون أي ضمانات صريحة أو ضمنية.</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">المادة 8: تحديد المسؤولية</h3>
            <p>المسؤولية القصوى للمطور لا تتجاوز المبلغ المدفوع خلال 3 أشهر السابقة. لا يتحمل المطور أي أضرار غير مباشرة أو تبعية أو خسارة أرباح.</p>
          </div>

          <div>
            <h3 class="font-bold text-warning mb-2">المادة 9: التعويض والحماية</h3>
            <p>يتعهد المستخدم بتعويض وحماية السيد Chouaib SEGHIER من أي دعاوى أو مطالبات أو غرامات أو تكاليف قانونية ناتجة عن استخدام المستخدم للبرنامج.</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">المادة 11: التنازل عن حق التقاضي</h3>
            <p>بقبول هذه الشروط، يتنازل المستخدم عن حقه في رفع أي دعوى ضد المطور فيما يتعلق بالخسائر المالية أو فقدان البيانات أو أي ضرر غير مباشر.</p>
          </div>

          <div>
            <h3 class="font-bold text-primary mb-2">المادة 12: القانون الواجب التطبيق</h3>
            <p>تخضع هذه الاتفاقية لقوانين الجمهورية الجزائرية الديمقراطية الشعبية. تختص المحاكم الجزائرية حصريًا بالنظر في أي نزاع.</p>
          </div>

          <div class="bg-base-200 rounded-lg p-3 text-xs text-center text-base-content/50">
            <p>هذا ملخص للشروط الرئيسية. للاطلاع على النص الكامل (15 مادة)، يمكنك مراجعة صفحة الشروط والأحكام الكاملة داخل التطبيق.</p>
          </div>

          {!scrolledToBottom && (
            <div class="text-center text-xs text-base-content/40 animate-bounce pt-2">
              ↓ يرجى التمرير لقراءة جميع الشروط ↓
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="p-5 border-t border-base-300 shrink-0 space-y-3">
          <label class={`flex items-start gap-3 cursor-pointer ${!scrolledToBottom ? 'opacity-40 pointer-events-none' : ''}`}>
            <input
              type="checkbox"
              class="checkbox checkbox-primary checkbox-sm mt-0.5"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={!scrolledToBottom}
            />
            <span class="text-sm leading-relaxed">
              أُقر بأنني قرأت وفهمت جميع شروط وأحكام الاستخدام، وأوافق عليها بالكامل دون أي تحفظ. أتحمل كامل المسؤولية عن استخدامي للبرنامج وأُعفي السيد <strong>Chouaib SEGHIER</strong> من أي مسؤولية.
            </span>
          </label>

          <div class="flex gap-2">
            <button
              class="btn btn-primary flex-1"
              disabled={!checked || !scrolledToBottom}
              onClick={handleAccept}
            >
              أوافق على الشروط والأحكام
            </button>
          </div>

          <p class="text-xs text-center text-base-content/40">
            © {new Date().getFullYear()} Chouaib SEGHIER — جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </div>
  )
}
