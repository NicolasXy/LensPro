/*
=========================================
LensPro - JavaScript Global
=========================================
*/

document.addEventListener("DOMContentLoaded", () => {

    initHeader();
    initFeatureCards();
    initForms();
    initMobileMenu();
    initAnimations();

});

/*
=========================================
HEADER TRANSPARENTE
=========================================
*/

function initHeader() {

    const header = document.querySelector("header");

    if (!header) return;

    window.addEventListener("scroll", () => {

        if (window.scrollY > 50) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }

    });

}

/*
=========================================
CARDS DA HOME
=========================================
*/

function initFeatureCards() {

    const cards = document.querySelectorAll(".feature-card");

    cards.forEach(card => {

        card.addEventListener("mouseenter", () => {
            card.style.boxShadow =
                "0 12px 35px rgba(255,77,103,.25)";
        });

        card.addEventListener("mouseleave", () => {
            card.style.boxShadow = "none";
        });

    });

}

/*
=========================================
FORMULÁRIOS
CORREÇÃO: removido e.preventDefault() e redirecionamentos
hardcoded. Agora o Flask gerencia login, cadastro e
recuperação de senha corretamente.
=========================================
*/

function initForms() {

    /*
    LOGIN — apenas feedback visual; submissão real vai para Flask
    */

    const loginForm = document.querySelector(".login-box");

    if (loginForm) {

        loginForm.addEventListener("submit", () => {

            const button =
                loginForm.querySelector("button[type='submit']");

            if (button) {
                button.innerText = "Entrando...";
                button.disabled = true;
            }

        });

    }

    /*
    CADASTRO — apenas feedback visual; submissão real vai para Flask
    */

    const registerForm =
        document.querySelector(".register-form");

    if (registerForm) {

        registerForm.addEventListener("submit", () => {

            const button =
                registerForm.querySelector("button[type='submit']");

            if (button) {
                button.innerText = "Criando conta...";
                button.disabled = true;
            }

        });

    }

    /*
    RECOVERY / CONTATO — desabilita botão para evitar duplo clique;
    submissão real vai para Flask
    */

    document.querySelectorAll(
        ".recovery-form, .contact-form"
    ).forEach(form => {

        form.addEventListener("submit", () => {

            const button =
                form.querySelector("button[type='submit']");

            if (button) {
                button.disabled = true;
            }

        });

    });

}

/*
=========================================
MENU MOBILE
=========================================
*/

function initMobileMenu() {

    const menuBtn =
        document.querySelector(".menu-toggle");

    const nav =
        document.querySelector("nav");

    if (!menuBtn || !nav) return;

    menuBtn.addEventListener("click", () => {

        nav.classList.toggle("active");

    });

}

/*
=========================================
ANIMAÇÕES
=========================================
*/

function initAnimations() {

    const elements =
        document.querySelectorAll(".fade-up");

    if (!elements.length) return;

    const observer =
        new IntersectionObserver(entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("show");

                }

            });

        });

    elements.forEach(el => observer.observe(el));

}
