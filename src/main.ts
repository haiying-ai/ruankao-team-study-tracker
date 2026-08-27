import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router'
import './styles.css'

registerSW({ immediate: true })

createApp(App).use(createPinia()).use(router).mount('#app')
