import { ref } from 'vue'

const message = ref<string | null>(null)
const key = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  return {
    message,
    key,
    show(msg: string, ms = 2600) {
      message.value = msg
      key.value++
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { message.value = null }, ms)
    },
  }
}
