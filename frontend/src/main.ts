import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { requireBluecoreLogin } from './bluecore'; // BLUECORE

// BLUECORE: log in through Keycloak before mounting (see src/bluecore)
requireBluecoreLogin().then(() => {
const app = createApp(App);
app.use(router);
app.mount('#app');
}); // BLUECORE
