lucide.createIcons();

        // --- THEME TOGGLE ---
        function toggleProfileTheme() {
            playClickSound();
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            localStorage.setItem('profileTheme', isLight ? 'light' : 'dark');
            updateThemeIcons();
        }

        function updateThemeIcons() {
            const isLight = document.body.classList.contains('light-theme');
            const darkIcon = document.getElementById('theme-icon-dark');
            const lightIcon = document.getElementById('theme-icon-light');
            if (darkIcon && lightIcon) {
                darkIcon.classList.toggle('hidden', isLight);
                lightIcon.classList.toggle('hidden', !isLight);
            }
        }

        function restoreProfileTheme() {
            const saved = localStorage.getItem('profileTheme');
            if (saved === 'light') {
                document.body.classList.add('light-theme');
            }
            updateThemeIcons();
        }

        // Restore theme immediately
        restoreProfileTheme();

        // --- GLOBAL STATE ---

        // --- TOGGLE TODO TIME PICKER ---
        function toggleTodoTime() {
            const checkbox = document.getElementById('toggle-todo');
            const timePicker = document.getElementById('todo-time-picker');
            if (checkbox.checked) {
                timePicker.classList.remove('hidden');
            } else {
                timePicker.classList.add('hidden');
            }
        }

        // --- AUDIO ENGINE ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function playClickSound() {
            if (navigator.vibrate) navigator.vibrate(10);
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        }

        // --- TOAST NOTIFICATIONS ---
        function showToast(message, type = 'normal') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `<div class="flex items-center gap-3"><i data-lucide="${type === 'error' ? 'alert-octagon' : 'check-circle'}" class="w-4 h-4"></i> ${message}</div>`;
            container.appendChild(toast);
            lucide.createIcons();
            
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // --- UI LOGIC ---
        function switchTab(tabName) {
            playClickSound();
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            event.currentTarget.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
            const activeContent = document.getElementById(`tab-${tabName}`);
            activeContent.classList.remove('hidden');
            activeContent.classList.remove('fade-up');
            void activeContent.offsetWidth; 
            activeContent.classList.add('fade-up');
        }

        function enableEdit(inputId) {
            playClickSound();
            const input = document.getElementById(inputId);
            input.readOnly = false;
            input.classList.add('editable');
            input.focus();
        }

        function navigateToDashboard() {
            playClickSound();
            const overlay = document.getElementById('transition-overlay');
            overlay.classList.add('active');
            setTimeout(() => window.location.href = "dashboard", 500);
        }

        /* --- PHOTO & AVATAR LOGIC --- */
        function togglePhotoMenu(e) {
            e.stopPropagation();
            const menu = document.getElementById('photo-menu');
            const btn = e.currentTarget.closest('.group'); 
            const rect = btn.getBoundingClientRect();
            menu.style.top = `${rect.bottom + 5}px`;
            menu.style.left = `${rect.left}px`;
            menu.classList.toggle('hidden');
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#photo-menu') && !e.target.closest('.group')) {
                document.getElementById('photo-menu').classList.add('hidden');
            }
        });

        function handleRemovePhoto() {
            document.getElementById('profile-avatar').src = 'https://ui-avatars.com/api/?name=User&background=111&color=555';
            document.getElementById('nav-avatar').src = 'https://ui-avatars.com/api/?name=User&background=111&color=555';
            showToast("Soul image erased from archives.", 'success');
            document.getElementById('photo-menu').classList.add('hidden');
        }

        function openAvatarModal() {
            document.getElementById('photo-menu').classList.add('hidden');
            const modal = document.getElementById('avatar-modal');
            modal.classList.add('active');
            regenerateAvatarGrid();
        }

        function closeModal(id) {
            document.getElementById(id).classList.remove('active');
        }

        /* --- PIXEL AVATAR GENERATOR --- */
        function generatePixelAvatar(seed, size=12) {
            const canvas = document.createElement('canvas');
            const scale = 10;
            canvas.width = size * scale;
            canvas.height = size * scale;
            const ctx = canvas.getContext('2d');
            let hash = 0;
            const str = seed + "salt"; 
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            const rng = () => { const x = Math.sin(hash++) * 10000; return x - Math.floor(x); }
            const bgColors = ['#1a1a1a', '#1e3a8a', '#4c1d95', '#052e16', '#7f1d1d', '#333'];
            const skinColors = ['#fdd0b1', '#e0ac69', '#8d5524', '#c68642', '#f1c27d'];
            const hairColors = ['#0f0f0f', '#4a2c2a', '#e6c35c', '#8d2d2d', '#5e3a28', '#ff6b00', '#00d2ff'];
            const shirtColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
            const bg = bgColors[Math.floor(rng() * bgColors.length)];
            const skin = skinColors[Math.floor(rng() * skinColors.length)];
            const hair = hairColors[Math.floor(rng() * hairColors.length)];
            const shirt = shirtColors[Math.floor(rng() * shirtColors.length)];
            const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, w * scale, h * scale); };
            rect(0, 0, size, size, bg);
            rect(3, 3, 6, 6, skin); rect(4, 9, 4, 2, skin);
            rect(2, 10, 8, 2, shirt);
            const hairType = Math.floor(rng()*3);
            if(hairType===0) { rect(3,2,6,2,hair); rect(2,3,1,4,hair); rect(9,3,1,4,hair); }
            else if(hairType===1) { rect(3,1,6,3,hair); rect(1,3,2,5,hair); rect(9,3,2,5,hair); }
            else { rect(3,2,6,1,skin); } // Bald/Short
            const eyeColor = rng() > 0.8 ? '#00d2ff' : '#000';
            rect(4,5,1,1, eyeColor); rect(7,5,1,1, eyeColor);
            if (rng() > 0.5) rect(5, 7, 2, 1, '#000'); else rect(5, 7, 2, 1, '#a00');
            if (rng() > 0.7) { rect(3, 5, 6, 1, '#fff'); ctx.fillStyle = 'rgba(0, 200, 255, 0.5)'; ctx.fillRect(3 * scale, 5 * scale, 2 * scale, 1 * scale); ctx.fillRect(7 * scale, 5 * scale, 2 * scale, 1 * scale); }
            return canvas.toDataURL();
        }

        function regenerateAvatarGrid() {
            const grid = document.getElementById('avatar-grid');
            grid.innerHTML = '';
            for(let i=0; i<12; i++) {
                const seed = Math.random().toString(36).substring(7);
                const src = generatePixelAvatar(seed);
                const div = document.createElement('div');
                div.className = "cursor-pointer border-2 border-transparent hover:border-[var(--reishi)] rounded-sm p-1 transition-all hover:scale-105";
                div.innerHTML = `<img src="${src}" class="w-full h-full pixel-avatar">`;
                div.onclick = () => selectAvatar(src);
                grid.appendChild(div);
            }
        }

        async function getWakeMeUpData() {
            const res = await fetch('/get_wake_me_up_data');
            const data = await res.json();
            if(data.wake_me_up_enabled) { 
                document.getElementById('wake-master').checked = true;
                let res2 = await fetch('/get_wake_me_up_settings');
                res2 = await res2.json();
                document.getElementById("wake-start").value = res2.wake_me_up_settings.wake_start || "06:00";
                document.getElementById("wake-end").value = res2.wake_me_up_settings.wake_end || "09:00";
                document.getElementById("ring-count").textContent = res2.wake_me_up_settings.ring_count || "3";
                document.getElementById(res2.wake_me_up_settings.btn_id || "friends").checked = true;
                toggleWakeSection();
            }
            else{
                document.getElementById('wake-master').checked = false;
            }
        }

        function selectAvatar(src) {
            fetch('/set_avatar', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ src: src })});
            document.getElementById('profile-avatar').src = src;
            document.getElementById('nav-avatar').src = src;
            closeModal('avatar-modal');
            showToast("Spirit Form Updated Successfully", 'success');
        }

        async function updateAvatarLive(val) {
            let response = await fetch('/get_avatar', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ username: val })});
            response = await response.json();
            let src;
            if (response.src)
            {
                src = response.src;
            }
            else
            {
            src = generatePixelAvatar(val || "user");
            await fetch('/set_avatar', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ src: src })});
            }
            document.getElementById('profile-avatar').src = src; // setting avatar
            document.getElementById('nav-avatar').src = src; // setting
        }

        // --- API FUNCTIONS ---
        async function fetchUserProfile() {
            // Simulate loading profile data
            setTimeout(() => {
                document.getElementById('loading-screen').style.opacity = '0';
                setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 800);
                updateAvatarLive(document.getElementById("username-input").value); // ye hai line
                fetch('/get_notifications_settings').then(res => res.json()).then(data => {
                    if(data.status === "success") {
                        const settings = data.settings;
                        document.getElementById("toggle-clan-invite").checked = settings.clan_invites || false;
                        document.getElementById("toggle-exams").checked = settings.exam_reminders || false;
                        document.getElementById("toggle-todo").checked = settings.allow_todo_time || false;
                        if (settings.allow_todo_time) {
                            document.getElementById("todo-time-picker").classList.remove("hidden");
                            document.getElementById("todo-notify-time").value = settings.to_do_time || "20:00";
                        }
                    }
                });
                getWakeMeUpData();
            }, 1500);
        }
        async function handleUpdateProfile() {
            playClickSound();
            showToast("Syncing Spirit Data...", 'normal');
            let bio = document.getElementById('bio-input').value;
            let name = document.getElementById('username-input').value;
            const response = await fetch('/update_profile', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ bio: bio, name: name })});
            if (response.ok) {
                    showToast("Profile Updated. Reloading...", 'success');
            }
            else
            {
                showToast("Profile Updation Failed");
            }
            location.reload();
        }

         function check_password(password) 
        {
            const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,64}$/;
            return PASSWORD_REGEX.test(password);
        }
        async function handleChangePassword() {
            playClickSound();
            const oldPass = document.getElementById("old-pass").value;
            const newPass = document.getElementById('new-pass').value;
            const confirmPass = document.getElementById('confirm-pass').value;
            if (newPass !== confirmPass) {
                showToast("Error: Spirit codes do not match.", 'error');
                return;
            }
            
            let response = await fetch("/update_password", {method:"POST", headers:{"Content-Type": "application/json"}, body: JSON.stringify({oldpass: oldPass, newpass: newPass})});
            const come = await response.json();
            if (come.status === "success")
            {
                    setTimeout(showToast("Password Updated Reloading...", 'success'),2000);
                    location.reload();
                    
            }
            else 
            {

                setTimeout(showToast("Invalid Password", 'error'), 2000);
                location.reload();

            }
            
        }
        

        // --- 2FA & DELETE ACCOUNT LOGIC ---
        
        function handleDeleteAccount() {
            const modal = document.getElementById('delete-modal');
            const step1 = document.getElementById('delete-step-1');
            const step2 = document.getElementById('delete-step-2');
            
            // Reset state
            document.getElementById('delete-password').value = '';
            document.querySelectorAll('.otp-input').forEach(i => i.value = '');
            step1.classList.remove('hidden');
            step2.classList.add('hidden');
            // Reset button state
            const btn = document.getElementById('delete-verify-btn');
            btn.disabled = false;
            btn.classList.remove('opacity-60', 'cursor-not-allowed');
            document.getElementById('delete-verify-text').textContent = 'Verify & Send OTP';
            
            modal.classList.add('active');
        }

        async function verifyDeletePassword() {
            const pass = document.getElementById('delete-password').value;
            const btn = document.getElementById('delete-verify-btn');
            const btnText = document.getElementById('delete-verify-text');
            if(pass.length === 0) {
                showToast("Password Required", 'error');
                return;
            }
            // Disable button and show spinner
            btn.disabled = true;
            btn.classList.add('opacity-60', 'cursor-not-allowed');
            btnText.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Sending OTP...`;
            try {
                const res = await fetch('/delete_account_verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pass })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    btnText.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> OTP Sent!`;
                    showToast("Password Verified. Dispatching Hell Butterfly...", 'normal');
                    setTimeout(() => {
                        document.getElementById('delete-step-1').classList.add('hidden');
                        document.getElementById('delete-step-2').classList.remove('hidden');
                        document.querySelector('.otp-input').focus();
                    }, 1000);
                } else if (data.message === 'INVALID_PASSWORD') {
                    showToast("Invalid Password", 'error');
                    btn.disabled = false;
                    btn.classList.remove('opacity-60', 'cursor-not-allowed');
                    btnText.textContent = 'Verify & Send OTP';
                } else {
                    showToast("Verification Failed", 'error');
                    btn.disabled = false;
                    btn.classList.remove('opacity-60', 'cursor-not-allowed');
                    btnText.textContent = 'Verify & Send OTP';
                }
            } catch (e) {
                showToast("Server Error", 'error');
                btn.disabled = false;
                btn.classList.remove('opacity-60', 'cursor-not-allowed');
                btnText.textContent = 'Verify & Send OTP';
            }
        }

        async function verifyOTPAndDelete() {
            let otp = "";
            document.querySelectorAll('.otp-input').forEach(i => otp += i.value);
            
            if(otp.length !== 6) {
                showToast("Enter the complete 6-digit OTP", 'error');
                return;
            }
            showToast("Verifying OTP...", 'normal');
            try {
                const res = await fetch('/delete_account_confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ otp: otp })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast("OTP Verified. Severing Link...", 'error');
                    setTimeout(() => {
                        window.location.href = "/";
                    }, 1500);
                } else if (data.message === 'INVALID_OR_EXPIRED_OTP') {
                    showToast("Invalid or Expired OTP", 'error');
                } else {
                    showToast("Deletion Failed", 'error');
                }
            } catch (e) {
                showToast("Server Error", 'error');
            }
        }

        // OTP Input Auto-Focus Logic
        document.querySelectorAll('.otp-input').forEach((input, index, inputs) => {
            input.addEventListener('input', (e) => {
                if(e.target.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if(e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                    inputs[index - 1].focus();
                }
            });
        });

        // --- TOGGLE WAKE ME UP SECTION ---
        function toggleWakeSection() {
            const checkbox = document.getElementById('wake-master');
            const body = document.getElementById('wake-settings-body');
            if (checkbox.checked) {
                body.classList.remove('hidden');
                body.style.opacity = '1';
                body.style.pointerEvents = 'auto';
            } else {
                body.classList.add('hidden');
                body.style.opacity = '0.4';
                body.style.pointerEvents = 'none';
            }
        }

        // Initialize
        document.addEventListener("DOMContentLoaded", async () => {
            await fetchUserProfile();
            // Show time picker if todo toggle is already checked on load
            toggleTodoTime();
            // Disable wake section if master toggle is off
            toggleWakeSection();
        });

        function togglePassword(inputId, btn) {
            const input = document.getElementById(inputId);
            const icon = btn.querySelector('i');
            
            if (input.type === "password") {
                input.type = "text";
                // Switch icon to eye-off (requires re-rendering icon or changing attribute if lucide supports dynamic swap, simpler to just replace innerHTML)
                btn.innerHTML = '<i data-lucide="eye-off" class="w-4 h-4"></i>';
            } else {
                input.type = "password";
                btn.innerHTML = '<i data-lucide="eye" class="w-4 h-4"></i>';
            }
            lucide.createIcons(); // Refresh icon
        }
    
        function updateClanNDB()
        {
            const btn = document.getElementById("toggle-clan-invite").checked;
            console.log(btn)
            fetch('/update/clan', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ allow_clan_invites: btn })});
            return;
        }

        function updateTodoTimeNDB()
        {
            const btn = document.getElementById("toggle-todo").checked;
            let time = null;
            if (btn){
                time = document.getElementById("todo-notify-time").value;
            }
            fetch('/update/todo_time', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ allow_todo_time: btn, to_do_time: time })});
            return;
        }
        function updateExamNDB()
        {
          const btn = document.getElementById("toggle-exams").checked;
          console.log(btn);
          fetch('/update/exam_reminders', {method:"POST" , headers: { "Content-Type": "application/json" },body: JSON.stringify({ exam_reminders: btn })});
          return;
        }
        function updateWakeMeUp()
        {   
            if( !document.getElementById("wake-master").checked)
            {
                fetch("/set_wake_me_up", {method: "POST", headers:{"Content-Type": "application/json"}, body:JSON.stringify({
                    wake_me_up_enabled: false,
                    wake_me_up_settings:{}
            })});
            }
            else
            {
                fetch("/set_wake_me_up" , {method:"POST",headers:{"Content-Type":"application/json"}, body:JSON.stringify({
                    wake_me_up_enabled: true,
                    wake_me_up_settings:{
                        wake_start : document.getElementById("wake-start").value || "06:00",
                        wake_end : document.getElementById("wake-end").value || "09:00",
                        ring_count: document.getElementById("ring-count").textContent || "3",
                        btn_id: getBtnId()
                    }
                })});
            }
        }
        function getBtnId()
        {
            if (document.getElementById("every").checked)
                return "every";

            else if (document.getElementById("friends").checked)
                return "friends";

            else if (document.getElementById("nobody").checked)
                return "nobody";
        }