document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierAppointment', () => ({
    enhanced: false,
    error: '',
    selectedDate: '',

    init() {
      if (!this.$refs.dateInput) return;
      const data = this.$el.dataset;
      this.locale = data.locale || document.documentElement.lang || 'en';
      this.today = this.midnight(new Date());
      this.first = this.addDays(this.today, Number(data.leadDays));
      this.last = this.addDays(this.today, Number(data.horizonDays));
      this.cursor = new Date(this.first.getFullYear(), this.first.getMonth(), 1);
      this.openHour = Number(data.openHour);
      this.closeHour = Number(data.closeHour);
      this.$refs.dateInput.min = this.iso(this.first);
      this.$refs.dateInput.max = this.iso(this.last);
      this.$refs.dateInput.required = false;
      this.$refs.dateInput.tabIndex = -1;
      this.$refs.timeInput.tabIndex = -1;
      const weekdayFormat = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
      for (let index = 0; index < 7; index++) {
        const day = document.createElement('span');
        day.textContent = weekdayFormat.format(new Date(2024, 0, 7 + index)).slice(0, 2);
        this.$refs.weekdays.append(day);
      }
      this.renderMonth();
      this.renderTimes();
      this.enhanced = true;
      this.onSubmit = event => this.validate(event);
      this.$el.querySelector('form').addEventListener('submit', this.onSubmit);
    },

    midnight(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    },

    addDays(date, count) {
      const result = new Date(date);
      result.setDate(result.getDate() + count);
      return result;
    },

    iso(date) {
      const pad = value => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },

    bookable(date) {
      return date >= this.first && date <= this.last && date.getDay() >= 2 && date.getDay() <= 6;
    },

    renderMonth() {
      const year = this.cursor.getFullYear();
      const month = this.cursor.getMonth();
      this.$refs.month.textContent = new Intl.DateTimeFormat(this.locale, { month: 'long', year: 'numeric' }).format(this.cursor);
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < new Date(year, month, 1).getDay(); index++) {
        const spacer = document.createElement('span');
        spacer.setAttribute('aria-hidden', 'true');
        fragment.append(spacer);
      }
      const dateFormat = new Intl.DateTimeFormat(this.locale, { dateStyle: 'full' });
      for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
        const date = new Date(year, month, day);
        const value = this.iso(date);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'atelier-appointment__day';
        button.textContent = day;
        button.dataset.date = value;
        button.disabled = !this.bookable(date);
        button.setAttribute('aria-label', dateFormat.format(date));
        button.setAttribute('aria-pressed', String(this.selectedDate === value));
        if (value === this.iso(this.today)) button.setAttribute('aria-current', 'date');
        fragment.append(button);
      }
      this.$refs.days.replaceChildren(fragment);
      this.$refs.previous.disabled = new Date(year, month, 0) < this.first;
      this.$refs.next.disabled = new Date(year, month + 1, 1) > this.last;
    },

    renderTimes() {
      const fragment = document.createDocumentFragment();
      if (!this.selectedDate || this.closeHour <= this.openHour) {
        const message = document.createElement('p');
        message.className = 'atelier-appointment__empty';
        message.textContent = this.selectedDate ? this.$el.dataset.chooseTime : this.$el.dataset.chooseDay;
        fragment.append(message);
      } else {
        for (let hour = this.openHour; hour < this.closeHour; hour++) {
          const value = `${String(hour).padStart(2, '0')}:00`;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'atelier-appointment__slot';
          button.dataset.time = value;
          button.textContent = value;
          button.setAttribute('aria-pressed', String(this.$refs.timeInput.value === value));
          fragment.append(button);
        }
      }
      this.$refs.times.replaceChildren(fragment);
    },

    selectDate(value) {
      const date = new Date(`${value}T00:00:00`);
      if (!this.bookable(date)) return;
      this.selectedDate = value;
      this.$refs.dateInput.value = value;
      this.$refs.dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      this.error = '';
      this.renderMonth();
      this.renderTimes();
      this.$refs.days.querySelector(`[data-date="${value}"]`)?.focus({ preventScroll: true });
    },

    handleClick(event) {
      const day = event.target.closest('[data-date]');
      if (day && !day.disabled) return this.selectDate(day.dataset.date);
      const slot = event.target.closest('[data-time]');
      if (slot) {
        this.$refs.timeInput.value = slot.dataset.time;
        this.$refs.timeInput.dispatchEvent(new Event('change', { bubbles: true }));
        this.$refs.times.querySelectorAll('[data-time]').forEach(button => {
          button.setAttribute('aria-pressed', String(button === slot));
        });
        this.error = '';
      }
      const arrow = event.target.closest('[data-month-offset]');
      if (arrow && !arrow.disabled) {
        this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + Number(arrow.dataset.monthOffset), 1);
        this.renderMonth();
      }
    },

    handleKeydown(event) {
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      const day = event.target.closest('[data-date]');
      if (!day || !offsets[event.key]) return;
      event.preventDefault();
      const offset = offsets[event.key];
      let date = this.addDays(new Date(`${day.dataset.date}T00:00:00`), offset);
      while (date >= this.first && date <= this.last && !this.bookable(date)) date = this.addDays(date, Math.sign(offset));
      if (!this.bookable(date)) return;
      this.cursor = new Date(date.getFullYear(), date.getMonth(), 1);
      this.renderMonth();
      this.$refs.days.querySelector(`[data-date="${this.iso(date)}"]`)?.focus();
    },

    validate(event) {
      const date = new Date(`${this.$refs.dateInput.value}T00:00:00`);
      if (!this.bookable(date) || !this.$refs.timeInput.value) {
        event.preventDefault();
        this.error = this.$refs.dateInput.value ? this.$el.dataset.chooseTime : this.$el.dataset.chooseDay;
        const target = this.$refs.dateInput.value ? this.$refs.times : this.$refs.calendar;
        target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        target.querySelector('[data-date]:not(:disabled), [data-time]')?.focus({ preventScroll: true });
      }
    },

    destroy() {
      this.$el.querySelector('form')?.removeEventListener('submit', this.onSubmit);
    }
  }));
});
