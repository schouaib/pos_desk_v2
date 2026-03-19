import { useI18n } from '../lib/i18n'

const testimonials = [
  { idx: 1, initials: 'KB', color: 'bg-primary text-primary-content' },
  { idx: 2, initials: 'AR', color: 'bg-success text-success-content' },
  { idx: 3, initials: 'YM', color: 'bg-info text-info-content' },
]

export function Testimonials() {
  const { t } = useI18n()

  return (
    <section id="testimonials" class="py-20 px-4 bg-base-200/50">
      <div class="max-w-7xl mx-auto">
        {/* Header */}
        <div class="text-center mb-14">
          <h2 class="text-3xl sm:text-4xl font-bold mb-3">{t('testimonialsTitle')}</h2>
          <p class="text-base-content/60 text-lg max-w-2xl mx-auto">{t('testimonialsSubtitle')}</p>
        </div>

        {/* Cards */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map(({ idx, initials, color }) => (
            <div key={idx} class="card bg-base-100 shadow-sm border border-base-200 rounded-2xl p-6">
              {/* Quote icon */}
              <svg class="w-8 h-8 text-primary/15 mb-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
              </svg>
              <p class="text-base-content/80 italic mb-5 leading-relaxed">
                "{t(`testimonial${idx}Quote`)}"
              </p>
              <div class="flex items-center gap-3 mt-auto">
                <div class={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-sm font-bold`}>
                  {initials}
                </div>
                <div>
                  <p class="font-semibold text-sm">{t(`testimonial${idx}Name`)}</p>
                  <p class="text-xs text-base-content/50">{t(`testimonial${idx}Role`)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
