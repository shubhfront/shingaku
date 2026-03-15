 lucide.createIcons();

        // THEME SWITCHER
        let isLightMode = localStorage.getItem('shingaku-theme') === 'light';
        const themeBtn = document.getElementById('theme-toggle');
        const sunIcon = document.getElementById('icon-sun');
        const moonIcon = document.getElementById('icon-moon');
        const body = document.body;
        let sceneRef, fogRef, coreMaterialRef, particlesMaterialRef, kanjiMaterialsRef = [];

        // Apply saved theme on load
        if (isLightMode) {
            body.classList.add('light-theme');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }

        themeBtn.addEventListener('click', () => {
            isLightMode = !isLightMode;
            body.classList.toggle('light-theme');
            sunIcon.classList.toggle('hidden');
            moonIcon.classList.toggle('hidden');
            localStorage.setItem('shingaku-theme', isLightMode ? 'light' : 'dark');
            updateThreeTheme();
        });

        const updateThreeTheme = () => {
            if(!sceneRef) return;
            if(isLightMode) {
                fogRef.color.setHex(0xe8e8e8);
                coreMaterialRef.color.setHex(0x2563eb);
                particlesMaterialRef.color.setHex(0x9333ea);
                kanjiMaterialsRef.forEach(mat => mat.color.setHex(Math.random() > 0.5 ? 0x2563eb : 0x9333ea));
            } else {
                fogRef.color.setHex(0x050505);
                coreMaterialRef.color.setHex(0x7c3aed);
                particlesMaterialRef.color.setHex(0x8b5cf6);
                kanjiMaterialsRef.forEach(mat => mat.color.setHex(Math.random() > 0.5 ? 0xff7b00 : 0x8b5cf6));
            }
        };

        // MOBILE MENU
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuClose = document.getElementById('mobile-menu-close');

        function openMobileMenu() {
            mobileMenu.style.display = 'flex';
            // Force reflow so the transition plays
            void mobileMenu.offsetHeight;
            mobileMenu.classList.remove('mobile-menu-hidden');
            // Remove mix-blend-difference so menu background is opaque
            document.getElementById('navbar').classList.remove('mix-blend-difference');
            document.body.style.overflow = 'hidden';
        }
        function closeMobileMenu() {
            mobileMenu.classList.add('mobile-menu-hidden');
            document.getElementById('navbar').classList.add('mix-blend-difference');
            document.body.style.overflow = '';
        }
        mobileMenuBtn.addEventListener('click', openMobileMenu);
        mobileMenuClose.addEventListener('click', closeMobileMenu);

        // Close mobile menu when clicking nav links
        mobileMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', closeMobileMenu);
        });

        // ==========================================
        // RESTORED USER JAVASCRIPT LOGIC
        // ==========================================
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
            else { rect(3,2,6,1,skin); }
            const eyeColor = rng() > 0.8 ? '#00d2ff' : '#000';
            rect(4,5,1,1, eyeColor); rect(7,5,1,1, eyeColor);
            if (rng() > 0.5) rect(5, 7, 2, 1, '#000'); else rect(5, 7, 2, 1, '#a00');
            if (rng() > 0.7) { rect(3, 5, 6, 1, '#fff'); ctx.fillStyle = 'rgba(0, 200, 255, 0.5)'; ctx.fillRect(3 * scale, 5 * scale, 2 * scale, 1 * scale); ctx.fillRect(7 * scale, 5 * scale, 2 * scale, 1 * scale); }
            return canvas.toDataURL();
        }

        const authModal = document.getElementById('auth-modal');
        const tabLogin = document.getElementById('tab-login');
        let user_login = false;
        let currentUserData = {username: "", rank: "", pfp: ""};
        const tabSignup = document.getElementById('tab-signup');
        const fieldUsername = document.getElementById('field-username');
        const submitText = document.getElementById('submit-text');
        const authSection = document.getElementById('auth-section');
        let currentAuthMode = 'signup';

        // BOOTING ANIMATION
        window.addEventListener('load', () => {
            initThreeJS();
            // Hide boot screen after simulated loading
            setTimeout(() => {
                const bootScreen = document.getElementById('boot-screen');
                bootScreen.style.opacity = '0';
                setTimeout(() => bootScreen.style.display = 'none', 800);
            }, 2500);

            getUserStatus().then(() => {
                ifLoggedIn();
            });
        });

        function openAuthModal(mode) {
            ['username', 'email', 'password'].forEach(id => document.getElementById(`err-${id}`).classList.add('hidden'));
            authModal.classList.add('open');
            switchAuthTab(mode);
        }

        function closeAuthModal() {
            ['username', 'email', 'password'].forEach(id => document.getElementById(`err-${id}`).classList.add('hidden'));
            authModal.classList.remove('open');
        }

        function switchAuthTab(mode) {
            currentAuthMode = mode;
            isOtpStep = false; // Reset OTP step
            ['username', 'email', 'password'].forEach(id => document.getElementById(`err-${id}`).classList.add('hidden'));
            // Reset UI visibility
            document.getElementById('field-username').classList.remove('hidden');
            document.getElementById('group-email').classList.remove('hidden');
            document.getElementById('group-password').classList.remove('hidden');
            document.getElementById('field-confirm-password').classList.remove('hidden'); // Show confirm pass
            document.getElementById('group-remember').classList.remove('hidden');
            document.getElementById('group-otp').classList.add('hidden');
            // Reset inputs validity/errors
            document.querySelectorAll('.text-red-500').forEach(el => el.classList.add('hidden'));

            if(mode === 'login') {
                tabLogin.classList.add('border-orange-500', 'text-orange-500');
                tabLogin.classList.remove('border-transparent');
                tabSignup.classList.remove('border-orange-500', 'text-orange-500');
                tabSignup.classList.add('border-transparent');
                
                document.getElementById('field-username').classList.add('hidden');
                document.getElementById('field-confirm-password').classList.add('hidden'); // Hide confirm pass
                document.getElementById('username').removeAttribute('required');
                document.getElementById('confirm-password').removeAttribute('required');
                
                submitText.textContent = "LOG IN";
            } else {
                tabSignup.classList.add('border-orange-500', 'text-orange-500');
                tabSignup.classList.remove('border-transparent');
                tabLogin.classList.remove('border-orange-500', 'text-orange-500');
                tabLogin.classList.add('border-transparent');
                
                // Ensure username is visible for signup
                document.getElementById('field-username').classList.remove('hidden');
                document.getElementById('field-confirm-password').classList.remove('hidden');
                document.getElementById('username').setAttribute('required', 'true');
                document.getElementById('confirm-password').setAttribute('required', 'true');
                
                submitText.textContent = "INITIATE SIGN UP";
            }
        }
        function togglePassword(fieldId, btn) {
            const input = document.getElementById(fieldId);
            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');
            
            if (input.type === 'password') {
                input.type = 'text';
                eyeOpen.classList.add('hidden');
                eyeClosed.classList.remove('hidden');
            } else {
                input.type = 'password';
                eyeOpen.classList.remove('hidden');
                eyeClosed.classList.add('hidden');
            }
        }


        // ------------------------------------------------------------------
        // THREE.JS & ANIMATION
        // ------------------------------------------------------------------
        const initThreeJS = () => {
            const container = document.getElementById('canvas-container');
            const scene = new THREE.Scene();
            sceneRef = scene;
            
            // Fog matches background color
            const fogColor = 0x050505; 
            scene.fog = new THREE.FogExp2(fogColor, 0.002);
            fogRef = scene.fog;

            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 50;

            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);

            // --- HOGYOKU (崩玉) ---
            const hogyoku = new THREE.Group();

            // 1. Inner core orb - the soul of the Hogyoku
            const coreGeo = new THREE.SphereGeometry(5, 64, 64);
            const coreMat = new THREE.MeshBasicMaterial({
                color: 0x7c3aed,
                transparent: true,
                opacity: 0.63,
                blending: THREE.AdditiveBlending
            });
            coreMaterialRef = coreMat;
            const core = new THREE.Mesh(coreGeo, coreMat);
            hogyoku.add(core);

            // 2. Inner glow shell (BackSide for bloom effect)
            const glowGeo = new THREE.SphereGeometry(6, 32, 32);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0x8b5cf6,
                transparent: true,
                opacity: 0.22,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            hogyoku.add(glow);

            // 3. Crystal shell - faceted icosahedron (solid faces)
            const shellGeo = new THREE.IcosahedronGeometry(9, 1);
            const shellSolidMat = new THREE.MeshBasicMaterial({
                color: 0x6d28d9,
                transparent: true,
                opacity: 0.07,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            const shellSolid = new THREE.Mesh(shellGeo, shellSolidMat);
            hogyoku.add(shellSolid);

            // 4. Crystal shell wireframe - stacked for bold lines
            const makeShellWire = (scale, opacity) => {
                const mat = new THREE.MeshBasicMaterial({
                    color: 0xc4b5fd,
                    wireframe: true,
                    transparent: true,
                    opacity: opacity,
                    blending: THREE.AdditiveBlending
                });
                const mesh = new THREE.Mesh(shellGeo.clone(), mat);
                mesh.scale.setScalar(scale);
                return mesh;
            };
            const shellWire = makeShellWire(1.0, 0.36);
            const shellWire2 = makeShellWire(1.01, 0.27);
            const shellWire3 = makeShellWire(0.99, 0.27);
            hogyoku.add(shellWire, shellWire2, shellWire3);

            // 5. Diamond cage - three intersecting octahedrons, bold lines
            const diamondGeo = new THREE.OctahedronGeometry(11, 0);
            const makeDiamond = (rx, ry, rz) => {
                const grp = new THREE.Group();
                [1.0, 1.015, 0.985].forEach(s => {
                    const mat = new THREE.MeshBasicMaterial({
                        color: 0xa78bfa,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.27,
                        blending: THREE.AdditiveBlending
                    });
                    const mesh = new THREE.Mesh(diamondGeo.clone(), mat);
                    mesh.scale.setScalar(s);
                    grp.add(mesh);
                });
                grp.rotation.set(rx, ry, rz);
                return grp;
            };
            const diamond1 = makeDiamond(0, 0, 0);
            const diamond2 = makeDiamond(0, 0, Math.PI / 4);
            const diamond3 = makeDiamond(Math.PI / 4, 0, 0);
            hogyoku.add(diamond1, diamond2, diamond3);

            // 6. Outer energy field
            const auraGeo = new THREE.IcosahedronGeometry(14, 2);
            const auraMat = new THREE.MeshBasicMaterial({
                color: 0x7c3aed,
                wireframe: true,
                transparent: true,
                opacity: 0.06,
                blending: THREE.AdditiveBlending
            });
            const aura = new THREE.Mesh(auraGeo, auraMat);
            hogyoku.add(aura);

            // 7. Energy rings orbiting the core
            const ringGeo = new THREE.TorusGeometry(10, 0.15, 16, 100);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xa78bfa,
                transparent: true,
                opacity: 0.32,
                blending: THREE.AdditiveBlending
            });
            const ring1 = new THREE.Mesh(ringGeo, ringMat);
            ring1.rotation.x = Math.PI / 2;
            hogyoku.add(ring1);

            const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
            ring2.rotation.x = Math.PI / 3;
            ring2.rotation.y = Math.PI / 4;
            hogyoku.add(ring2);

            hogyoku.scale.setScalar(1.8);
            scene.add(hogyoku);
            const spiritCore = hogyoku; // alias for animation reference

            // --- KANJI ---
            // Added Om Symbol
            const kanjiChars = ['卍', '解', '魂', '死', '神', '虚', '斬', '力', 'ॐ'];
            const kanjiObjects = []; // Store custom objects for animation logic
            
            const createKanjiTexture = (char) => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                ctx.font = 'bold 80px "Kosugi Maru", "Arial", sans-serif'; 
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(char, 64, 64);
                return new THREE.CanvasTexture(canvas);
            };

            kanjiChars.forEach((char) => {
                const texture = createKanjiTexture(char);
                for (let i = 0; i < 3; i++) {
                     const material = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: true,
                        opacity: 0.15, 
                        color: Math.random() > 0.5 ? 0xff7b00 : 0x00f2ff,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                        blending: THREE.AdditiveBlending
                    });
                    kanjiMaterialsRef.push(material); // Store ref for theme switching
                    
                    const geometry = new THREE.PlaneGeometry(5, 5);
                    const mesh = new THREE.Mesh(geometry, material);
                    
                    const startX = (Math.random() - 0.5) * 160;
                    const startY = (Math.random() - 0.5) * 160;
                    const startZ = (Math.random() - 0.5) * 100;

                    mesh.position.set(startX, startY, startZ);
                    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    
                    scene.add(mesh);
                    
                    kanjiObjects.push({
                        mesh,
                        baseY: startY,
                        speed: Math.random() * 0.02,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            });


            // --- PARTICLES ---
            const particlesGeometry = new THREE.BufferGeometry();
            const particlesCount = 1500;
            const posArray = new Float32Array(particlesCount * 3);
            for (let i = 0; i < particlesCount * 3; i+=3) {
                posArray[i] = (Math.random() - 0.5) * 200;
                posArray[i+1] = (Math.random() - 0.5) * 200;
                posArray[i+2] = (Math.random() - 0.5) * 200;
            }
            particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            const particlesMaterial = new THREE.PointsMaterial({
                size: 0.2,
                color: 0x8b5cf6,
                transparent: true,
                opacity: 0.6,
            });
            particlesMaterialRef = particlesMaterial;
            const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
            scene.add(particlesMesh);

            // --- ANIMATION LOOP ---
            let mouseX = 0;
            let mouseY = 0;
            
            document.addEventListener('mousemove', (event) => {
                mouseX = (event.clientX - window.innerWidth / 2) * 0.1;
                mouseY = (event.clientY - window.innerHeight / 2) * 0.1;
            });

            const animate = () => {
                requestAnimationFrame(animate);

                // Get scroll percentage
                const scrollY = window.scrollY;
                const docHeight = document.body.scrollHeight - window.innerHeight;
                const scrollPercent = scrollY / docHeight;

                // --- SCROLL ANIMATION LOGIC ---

                const time = Date.now() * 0.001;

                // 1. Hogyoku animation
                // Whole group slow rotation + scroll parallax
                spiritCore.rotation.y += 0.003;
                spiritCore.position.y = -scrollY * 0.02;

                // Core orb pulsing glow
                const pulse = 1 + Math.sin(time * 1.5) * 0.08;
                core.scale.setScalar(pulse);
                coreMat.opacity = 0.45 + Math.sin(time * 2) * 0.18;

                // Inner glow breathes
                glow.scale.setScalar(1 + Math.sin(time * 0.8) * 0.1);

                // Crystal shell slow counter-rotation
                shellSolid.rotation.x += 0.002;
                shellSolid.rotation.z += 0.001;
                shellWire.rotation.x += 0.002;
                shellWire.rotation.z += 0.001;

                // Diamond cage - each rotates on different axes
                diamond1.rotation.y += 0.004;
                diamond1.rotation.x += 0.001;
                diamond2.rotation.y -= 0.003;
                diamond2.rotation.z += 0.002;
                diamond3.rotation.x -= 0.002;
                diamond3.rotation.y += 0.003;

                // Outer aura slow drift
                aura.rotation.x += 0.0005;
                aura.rotation.y -= 0.0008;
                aura.scale.setScalar(1 + Math.sin(time * 0.5) * 0.03);

                // Energy rings orbit
                ring1.rotation.z += 0.008;
                ring2.rotation.z -= 0.006;
                ring2.rotation.x += 0.002;

                // 2. Animate Kanji with scroll influence
                kanjiObjects.forEach(item => {
                    item.mesh.rotation.x += item.speed;
                    item.mesh.rotation.y += item.speed;
                    
                    // Add wave motion + scroll offset
                    // As you scroll down, items move up (Parallax)
                    item.mesh.position.y = item.baseY + Math.sin(Date.now() * 0.001 + item.phase) * 5 + (scrollY * 0.05);
                });

                // 3. Rotate entire particle field based on scroll
                particlesMesh.rotation.y = scrollY * 0.0005;
                scene.rotation.z = scrollY * 0.0002; // Slight tilt of the world

                // Camera mouse follow
                camera.position.x += (mouseX * 0.1 - camera.position.x) * 0.05;
                camera.position.y += (-mouseY * 0.1 - camera.position.y) * 0.05;
                camera.lookAt(scene.position);

                renderer.render(scene, camera);
            };

            animate();

            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });
        };

        // ------------------------------------------------------------------
        // NAVBAR SCROLL LOGIC
        // ------------------------------------------------------------------
        const navbar = document.getElementById('navbar');
        const joinSection = document.getElementById('join');

        window.addEventListener('scroll', () => {
            if (!joinSection || !navbar) return;
            const rect = joinSection.getBoundingClientRect();
            // Hide navbar when footer enters viewport (visible at bottom)
            if (rect.top <= window.innerHeight) {
                navbar.classList.add('-translate-y-full');
            } else {
                navbar.classList.remove('-translate-y-full');
            }
        });


        // ------------------------------------------------------------------
        // INTERSECTION OBSERVER (Scroll Reveal)
        // ------------------------------------------------------------------
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-visible');
                    observer.unobserve(entry.target); 
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
        });

        document.querySelectorAll('.reveal-hidden').forEach((el) => observer.observe(el));

        


        const submit_button = document.getElementById("submit-button-1");
        const auth_form = document.getElementById("auth-form");

        async function getData(username, email,password) 
        {
            const head = {method: "POST", headers:{"Content-Type": "application/json"}, body:`{"username":"${username}", "email":"${email}", "password":"${password}", "remember": ${document.getElementById("remember-me").checked}}`};
            const response = await fetch("/signup", head);
            console.log(response);
        }

        function check_username(username) 
        {
            const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
            return USERNAME_REGEX.test(username);
        }

        function check_email(email) 
        {
            const EMAIL_REGEX = /^25(bar|bcs|bec|bee|bme|bce|bch|bma|bph|bms|dcs|dec)[0-9]{3}@nith\.ac\.in$/;
            return EMAIL_REGEX.test(email);
        }
        
        function check_password(password) 
        {
            const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,64}$/;
            return PASSWORD_REGEX.test(password);
        }
        async function waitForClick(btn) 
        {
            return new Promise(resolve => {
                btn.addEventListener("click", (e) => {
                e.preventDefault();
                resolve();
                                            }, { once: true });
            });
        }

        async function username_check(username) {
    const res = await fetch("/username_check", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: username
        })
    });

    const response = await res.json();
    return response.status // if false means username taken
}


        async function email_check(email) {
            const res = await fetch("/email_check", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                    },
                body: JSON.stringify({
                    email: email
                })
                });

    const response = await res.json();
    return response.status // if false means email taken, true matlab email not taken
}


        async function handleformsubmit(e)
        {
            e.preventDefault();// avoid page reload
            if(currentAuthMode === "login")
            {
                const email = document.getElementById("email").value;
                const password = document.getElementById("password").value;
                
                ['email', 'password'].forEach(id => document.getElementById(`err-${id}`).classList.add('hidden'));
                let bool = false;
                
                if(!check_email(email))
                {
                const err = document.getElementById('err-email');
                err.textContent = "INVALID EMAIL";
                err.classList.remove('hidden');
                bool = true;
                }
                if(!check_password(password))
                {
                const err = document.getElementById('err-password');
                err.textContent = "Check Your Credentials";
                err.classList.remove('hidden');
                bool = true;
                }
                if (await email_check(email) === "NOT_TAKEN")
                {
                    const err = document.getElementById('err-email');
                    err.textContent = "EMAIL NOT REGISTERED";
                    err.classList.remove('hidden');
                    bool = true;
                }
                if (bool)
                {
                    return 
                }
                    submitText.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg> CONNECTING...`;
                    const head = {method: "POST", headers:{"Content-Type": "application/json"}, body:JSON.stringify({email: email, password: password, remember: document.getElementById("remember-me").checked})};
                    let json = await fetch("/login", head);
                    const result = await json.json();
                    if(result.status === "error")
                    {
                        const err = document.getElementById('err-password');
                        err.textContent = "INVALID CREDENTIALS";
                        err.classList.remove('hidden');
                        location.reload();
                        return;
                    }
                    if (result.status === "success")
                    {
                         location.reload()
                    }
                    
                
            }

            const email = document.getElementById("email").value;
            const username = document.getElementById('username').value;
            const password = document.getElementById("password").value;
            const confirm_password = document.getElementById("confirm-password").value;
            ['username', 'email', 'password', 'confirm-password'].forEach(id => document.getElementById(`err-${id}`).classList.add('hidden'));
            let bool = false;
            if(password !== confirm_password)
                {
                    const err = document.getElementById('err-confirm-password');
                    err.textContent = "Passwords Don't Match";
                    err.classList.remove('hidden');
                    bool = true;
                }

            if((await username_check(username)) === "TAKEN")
            {
                const err = document.getElementById('err-username');
                err.textContent = "USERNAME ALREADY TAKEN";
                err.classList.remove('hidden');
                bool = true;
            }
            if(((await email_check(email))) === "TAKEN")
            {
                const err = document.getElementById('err-email');
                err.textContent = "EMAIL ALREADY REGISTERED";
                err.classList.remove('hidden');
                bool = true;
            }
            if(!check_username(username))
            {
                const err = document.getElementById('err-username');
                err.textContent = "3-20 CHARACTERS. LETTERS, NUMBERS & UNDERSCORES ONLY.";
                err.classList.remove('hidden');
                bool = true;
            }
            if(!check_email(email))
            {
                const err = document.getElementById('err-email');
                err.textContent = "INVALID EMAIL";
                err.classList.remove('hidden');
                bool = true;
            }
            if(!check_password(password))
            {
                const err = document.getElementById('err-password');
                err.textContent = "8-64 CHARS, INC. UPPER, LOWER, NUMBER & SPECIAL CHAR.";
                err.classList.remove('hidden');
                bool = true;
            }
            if(bool)
            {
                return;
            }
            submitText.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg> CONNECTING...`;
            let b = await getData(username, email,password);
            submitText.textContent = "GENERATING SPIRIT CODE...";
            document.getElementById('field-username').classList.add('hidden');
            document.getElementById('group-email').classList.add('hidden');
            document.getElementById('group-password').classList.add('hidden');
            document.getElementById('group-remember').classList.add('hidden');
            document.getElementById('field-confirm-password').classList.add('hidden');            
            document.getElementById('group-otp').classList.remove('hidden');
            document.getElementById('otp').focus(); // LIKE KISI File ko single click dena
            submitText.textContent = "VERIFY OTP";
            submit_button.removeEventListener("click", handleformsubmit);
            await waitForClick(submit_button); // for 300 seconds, lets assume otp is 6 digits
            const otp = document.getElementById('otp').value;
            submitText.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg> VERIFYING...`;
            json = await fetch("/verify-otp", {method: "POST", headers:{"Content-Type": "application/json"}, body:JSON.stringify({username: username, email: email, otp: otp})});
            const result = await json.json();
            if(result.status === "error")
            {
                const err = document.getElementById('err-otp');
                err.textContent = "OTP INVALID OR EXPIRED";
                err.classList.remove('hidden');
                return;
            }
            submitText.textContent = "OTP VERIFIED! REDIRECTING...";
            if (result.status === "success")
            {
                 location.reload()
            }
        }

        function toggleUserDropdown() {
            const dropdown = document.getElementById('user-dropdown');
            if(dropdown) {
                dropdown.classList.toggle('hidden');
            }
        }

        function logout() {
            fetch("/logout", {method: "POST"})
                .then(response => response.json())
                .then(data => {
                    if(data.status === "success") {
                        // Reload the page to reflect logged-out state
                        window.location.reload();
                    }
                });
        }

        function ifLoggedIn() {
            if (user_login) {
                // 1. Update Navigation Auth Section
                authSection.innerHTML =  `
                    <div class="relative group">
                        <button onclick="toggleUserDropdown()" class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none text-left">
                             <div class="text-right hidden md:block">
                                 <div class="text-xs text-gray-400 tracking-widest">RANK ${currentUserData.rank} / <span class="font-jp">第十席</span></div>
                                 <div class="font-bold theme-text-primary uppercase">${currentUserData.username}</div>
                             </div>
${currentUserData.avatar
                         ? `<img src="${currentUserData.avatar}" class="w-10 h-10 rounded-full object-cover border-2 border-white/10 shadow-[0_0_15px_rgba(255,123,0,0.5)]">`
                         : `<div class="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xl border-2 border-white/10 shadow-[0_0_15px_rgba(255,123,0,0.5)]">${currentUserData.pfp}</div>`
                     }
                        </button>

                        <!-- Dropdown Menu -->
                        <div id="user-dropdown" class="absolute right-0 mt-4 w-56 theme-bg-card border theme-border backdrop-blur-xl hidden z-50 transform origin-top-right transition-all duration-200">
                            <!-- Decorative Corner Clip -->
                            <div class="absolute top-0 right-0 w-3 h-3 bg-orange-500"></div>
                            
                            <div class="py-2">
                                <a href="/dashboard" class="flex items-center px-6 py-3 text-sm theme-text-primary hover:bg-white/10 transition-colors tracking-widest font-bold border-b theme-border group/item">
                                    <i data-lucide="layout-dashboard" class="w-4 h-4 mr-3 group-hover/item:text-orange-500 transition-colors"></i>
                                    DASHBOARD
                                </a>
                                <button onclick="logout()" class="flex w-full items-center px-6 py-3 text-sm text-red-500 hover:bg-white/10 transition-colors tracking-widest font-bold text-left group/item">
                                    <i data-lucide="log-out" class="w-4 h-4 mr-3 group-hover/item:text-red-400 transition-colors"></i>
                                    LOGOUT
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                // 2. Update Hero CTA Button
                const heroBtn = document.getElementById('hero-cta-btn');
                const heroText = document.getElementById('hero-cta-text');
                
                if (heroBtn && heroText) {
                    heroBtn.onclick = function() {
                        // Redirect to dashboard
                        window.location.href = '/dashboard';
                    };
                    heroText.textContent = "DASHBOARD";
                    
                    // Optional: Add a visual indicator that it's now a dashboard link
                    heroBtn.classList.add('ring-2', 'ring-offset-2', 'ring-orange-500');
                }

                // 2b. Update Footer CTA Button
                const footerBtn = document.getElementById('footer-cta-btn');
                const footerText = document.getElementById('footer-cta-text');
                if (footerBtn && footerText) {
                    footerBtn.onclick = function() {
                        window.location.href = '/dashboard';
                    };
                    footerText.textContent = "DASHBOARD";
                }

                // 3. Update Mobile Menu Auth Section
                const mobileAuth = document.getElementById('mobile-auth-section');
                if (mobileAuth) {
                    mobileAuth.innerHTML = `
                        <div class="flex flex-col gap-3">
                            <div class="flex items-center gap-4 mb-3 px-2 py-3 bg-white/5 rounded-sm border border-white/10">
                                ${currentUserData.avatar
                                    ? `<img src="${currentUserData.avatar}" class="w-10 h-10 rounded-full object-cover border-2 border-white/10">`
                                    : `<div class="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xl border-2 border-white/10">${currentUserData.pfp}</div>`
                                }
                                <div>
                                    <div class="font-bold text-white uppercase tracking-widest text-lg">${currentUserData.username}</div>
                                    <div class="text-xs text-gray-500 tracking-widest">RANK ${currentUserData.rank}</div>
                                </div>
                            </div>
                            <a href="/dashboard" class="w-full text-center py-4 bg-white/10 border border-white/10 text-white font-bold hover:bg-white/20 tracking-[0.2em] transition-colors clip-button">DASHBOARD</a>
                            <button onclick="logout()" class="w-full text-center py-4 border border-red-500/50 text-red-500 font-bold hover:bg-red-500/10 tracking-[0.2em] transition-colors clip-button">LOGOUT</button>
                        </div>
                    `;
                }
            }
        }

        async function getUserStatus()
        {
            const response = await fetch("/", {method: "POST"});
            const result = await response.json();
            if (result.message === "LOGGED_IN")
            {
                user_login = true;
                let avatar = result.avatar || "";
                if (!avatar) {
                    avatar = generatePixelAvatar(result.username);
                    fetch('/set_avatar', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({src: avatar})});
                }
                currentUserData = {username: result.username, rank: "N/A", pfp: result.username.charAt(0).toUpperCase(), avatar: avatar};
            }
            
        }
        submit_button.addEventListener("click", handleformsubmit);

        