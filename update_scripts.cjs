const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The new unified practice and interactive learning script
const newPracticeScript = `    // ----- Unified Exam & Class Practice System -----
    const QUIZ_ROUND_SIZE = 5;
    const THEORY_ROUND_SIZE = 3;
    const practiceState = { primary: null, primary_class: null, jss: null, jss_class: null, sss: null, sss_class: null };
    const theoryPracticeState = { primary: null, primary_class: null, jss: null, jss_class: null, sss: null, sss_class: null };
    const lastPracticeTopic = {};
    const lastPracticeSubject = {};

    function safe(value){const node=document.createElement('div');node.textContent=value==null?'':String(value);return node.innerHTML}

    function toggleExamGuide(level){
      let bodyId = 'primaryGuideBody', btnId = 'primaryGuideToggleBtn';
      if(level === 'jss'){ bodyId = 'jssGuideBody'; btnId = 'jssGuideToggleBtn'; }
      else if(level === 'sss'){ bodyId = 'sssGuideBody'; btnId = 'sssGuideToggleBtn'; }
      const body = document.getElementById(bodyId);
      const btn = document.getElementById(btnId);
      if(!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if(btn){
        btn.textContent = isOpen ? '📖 Open Exam Success Guide' : '✕ Close Exam Success Guide';
      }
    }

    function saveLastLearningActivity(info){
      try{
        localStorage.setItem('salone_last_activity', JSON.stringify({
          ...info,
          timestamp: Date.now()
        }));
      }catch{}
    }

    function checkWelcomeBack(){
      try{
        const raw = localStorage.getItem('salone_last_activity');
        if(!raw) return;
        const act = JSON.parse(raw);
        if(!act || !act.label) return;
        const box = document.getElementById('welcomeBackContainer');
        const nameEl = document.getElementById('welcomeBackName');
        const actEl = document.getElementById('welcomeBackActivity');
        if(!box || !actEl) return;
        const name = typeof firstName === 'function' ? firstName() : '';
        nameEl.textContent = name ? 'Welcome back, ' + name + '!' : 'Welcome back!';
        actEl.textContent = 'You were practising ' + act.label + '.';
        box.style.display = 'block';
      }catch{}
    }

    function dismissWelcomeBack(){
      const box = document.getElementById('welcomeBackContainer');
      if(box) box.style.display = 'none';
    }

    function continueLastLearning(){
      try{
        const raw = localStorage.getItem('salone_last_activity');
        if(!raw) return;
        const act = JSON.parse(raw);
        dismissWelcomeBack();
        if(!act.section) return;

        let targetId = '';
        if(act.section === 'primary_class'){
          targetId = 'primaryClassPracticeCard';
          if(act.classLevel) { const el = document.getElementById('primaryPracticeClass'); if(el) el.value = act.classLevel; }
          if(act.subject) {
            const el = document.getElementById('primaryPracticeSubject');
            if(el) {
              el.value = act.subject;
              const topSel = document.getElementById('primaryPracticeTopicSelect');
              if(topSel && typeof loadTopicPicker === 'function') loadTopicPicker(topSel);
            }
          }
          if(act.topic) { const el = document.getElementById('primaryPracticeTopic'); if(el) el.value = act.topic; }
          if(act.quizType) {
            const el = document.getElementById('primaryPracticeQuizType');
            if(el) { el.value = act.quizType; updatePracticeBtnText('primary_class'); }
          }
        } else if(act.section === 'primary'){
          targetId = 'npsePracticeCard';
          if(act.subject) { const el = document.getElementById('npseSubject'); if(el) el.value = act.subject; }
          if(act.topic) { const el = document.getElementById('npseTopic'); if(el) el.value = act.topic; }
          if(act.quizType) {
            const el = document.getElementById('npseQuizType');
            if(el) { el.value = act.quizType; updatePracticeBtnText('primary'); }
          }
        } else if(act.section === 'jss_class'){
          targetId = 'jssClassPracticeCard';
          if(act.classLevel) { const el = document.getElementById('jssPracticeClass'); if(el) el.value = act.classLevel; }
          if(act.subject) {
            const el = document.getElementById('jssPracticeSubject');
            if(el) {
              el.value = act.subject;
              const topSel = document.getElementById('jssPracticeTopicSelect');
              if(topSel && typeof loadTopicPicker === 'function') loadTopicPicker(topSel);
            }
          }
          if(act.topic) { const el = document.getElementById('jssPracticeTopic'); if(el) el.value = act.topic; }
          if(act.quizType) {
            const el = document.getElementById('jssClassQuizType');
            if(el) { el.value = act.quizType; updatePracticeBtnText('jss_class'); }
          }
        } else if(act.section === 'jss'){
          targetId = 'becePracticeCard';
          if(act.subject) { const el = document.getElementById('jssQuizSubject'); if(el) el.value = act.subject; }
          if(act.topic) { const el = document.getElementById('jssQuizTopic'); if(el) el.value = act.topic; }
          if(act.quizType) {
            const el = document.getElementById('jssQuizType');
            if(el) { el.value = act.quizType; updatePracticeBtnText('jss'); }
          }
        } else if(act.section === 'sss_class'){
          targetId = 'sssClassPracticeCard';
          if(act.classLevel) { const el = document.getElementById('sssPracticeClass'); if(el) el.value = act.classLevel; }
          if(act.subject) {
            const el = document.getElementById('sssPracticeSubject');
            if(el) {
              el.value = act.subject;
              const topSel = document.getElementById('sssPracticeTopicSelect');
              if(topSel && typeof loadTopicPicker === 'function') loadTopicPicker(topSel);
            }
          }
          if(act.topic) { const el = document.getElementById('sssPracticeTopic'); if(el) el.value = act.topic; }
          if(act.quizType) {
            const el = document.getElementById('sssClassQuizType');
            if(el) { el.value = act.quizType; updatePracticeBtnText('sss_class'); }
          }
        } else if(act.section === 'sss'){
          targetId = 'wasscePracticeCard';
          if(act.subject) { const el = document.getElementById('sssQuizSubject'); if(el) el.value = act.subject; }
          if(act.topic) { const el = document.getElementById('sssQuizTopic'); if(el) el.value = act.topic; }
          if(act.quizType) {
            const el = document.getElementById('sssQuizType');
            if(el) { el.value = act.quizType; updatePracticeBtnText('sss'); }
          }
        }

        const el = document.getElementById(targetId) || document.getElementById(act.section);
        if(el){
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-card');
          setTimeout(() => el.classList.remove('highlight-card'), 3600);
        }
      }catch{}
    }

    function updatePracticeBtnText(level){
      let btnId = '', typeId = '', examLabel = '';
      if(level === 'primary'){
        btnId = 'npsePracticeBtn'; typeId = 'npseQuizType'; examLabel = 'NPSE';
      } else if(level === 'primary_class'){
        btnId = 'primaryClassPracticeBtn'; typeId = 'primaryPracticeQuizType'; examLabel = 'Class Practice';
      } else if(level === 'jss'){
        btnId = 'jssPracticeBtn'; typeId = 'jssQuizType'; examLabel = 'BECE';
      } else if(level === 'jss_class'){
        btnId = 'jssClassPracticeBtn'; typeId = 'jssClassQuizType'; examLabel = 'Class Practice';
      } else if(level === 'sss'){
        btnId = 'sssPracticeBtn'; typeId = 'sssQuizType'; examLabel = 'WASSCE';
      } else if(level === 'sss_class'){
        btnId = 'sssClassPracticeBtn'; typeId = 'sssClassQuizType'; examLabel = 'Class Practice';
      }
      const btn = document.getElementById(btnId);
      const typeEl = document.getElementById(typeId);
      if(!btn) return;
      const val = typeEl?.value || '';
      if(!val){
        btn.textContent = 'Generate Questions';
      } else if(val === 'theory'){
        btn.textContent = 'Generate 3 Theory Questions';
      } else {
        btn.textContent = 'Generate 5 Questions';
      }
    }
    setTimeout(()=>{
      ['primary','primary_class','jss','jss_class','sss','sss_class'].forEach(updatePracticeBtnText);
      checkWelcomeBack();
    }, 0);

    function scoreStorageKey(level, subject, topic){
      return 'salone_score_' + [level, subject, topic].join('|').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }
    function getPreviousPracticeScore(level, subject, topic){
      try{
        const val = localStorage.getItem(scoreStorageKey(level, subject, topic));
        return (val !== null && !isNaN(Number(val))) ? Number(val) : null;
      }catch{ return null; }
    }
    function savePreviousPracticeScore(level, subject, topic, score){
      try{
        localStorage.setItem(scoreStorageKey(level, subject, topic), String(score));
      }catch{}
    }

    function seenKey(level,subject,topic){return 'saloneSeen_'+[level,subject,topic].join('|').toLowerCase()}
    function getSeenQuestions(level,subject,topic){try{return JSON.parse(sessionStorage.getItem(seenKey(level,subject,topic))||'[]').slice(-50)}catch{return []}}
    function rememberSeenQuestions(level,subject,topic,questions){const all=[...getSeenQuestions(level,subject,topic),...questions.map(q=>q.question).filter(Boolean)];sessionStorage.setItem(seenKey(level,subject,topic),JSON.stringify([...new Set(all)].slice(-50)))}

    function normalizedQuestionText(text){return String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
    async function fetchFreshQuestions({level,class_level,subject,topic,exam,count,toolKey}){
      const previous=getSeenQuestions(level,subject,topic);
      const blocked=new Set(previous.map(normalizedQuestionText));
      const collected=[];
      for(let attempt=0; attempt<4 && collected.length<count; attempt++){
        const nonce=Date.now()+'-'+attempt+'-'+Math.random().toString(36).slice(2,8);
        const requestTopic=topic+'\\n\\nFresh practice set ID: '+nonce+'. Generate different questions from earlier practice sets.';
        const data=await learningRequest({
          level,class_level,subject,topic:requestTopic,exam,task:'quiz',
          question_count:count-collected.length,
          tool_key:toolKey,
          excluded_questions:[...previous,...collected.map(q=>q.question)],
          context:'Return fresh, non-repeated questions only. Do not reuse any question from excluded_questions. Every question in this set must also be different from the others.'
        });
        for(const q of (data.questions||[])){
          const key=normalizedQuestionText(q?.question);
          if(key && !blocked.has(key)){
            blocked.add(key);collected.push(q);
            if(collected.length===count)break;
          }
        }
      }
      return collected.slice(0,count);
    }

    function renderPracticeError(cfg, retryCallback){
      cfg.box.innerHTML =
        '<div style="margin:16px 0;padding:20px;border:1.5px solid #cbd6e4;border-radius:12px;background:#f8fafc;text-align:center">' +
          '<p style="margin:0 0 14px;font-weight:700;color:#1e293b;font-size:1.05rem">We couldn\'t generate the questions. Please try again.</p>' +
          '<button type="button" class="btn btn-blue" id="' + cfg.level + '_retry_btn" style="padding:10px 24px;font-size:1rem;font-weight:700">Try Again</button>' +
        '</div>';
      cfg.box.classList.add('show');
      document.getElementById(cfg.level + '_retry_btn')?.addEventListener('click', retryCallback);
    }

    function getPracticeConfig(level, repeatSameTopic){
      let subject='', topic='', box=null, exam='', type='', classLevel='';
      if(level === 'primary'){
        exam = 'NPSE';
        classLevel = 'Class 6';
        subject = (document.getElementById('npseSubject')?.value || '').trim();
        const ts = document.getElementById('npseTopicSelect'), tm = document.getElementById('npseTopic');
        topic = (((tm?.value||'').trim()) || (ts?.value==='__other__'?'':ts?.value||'')).trim();
        box = document.getElementById('npseQuizArea');
        type = document.getElementById('npseQuizType')?.value || '';
      } else if(level === 'primary_class'){
        exam = 'Class Practice';
        classLevel = (document.getElementById('primaryPracticeClass')?.value || '').trim();
        subject = (document.getElementById('primaryPracticeSubject')?.value || '').trim();
        const ts = document.getElementById('primaryPracticeTopicSelect'), tm = document.getElementById('primaryPracticeTopic');
        topic = (((tm?.value||'').trim()) || (ts?.value==='__other__'?'':ts?.value||'')).trim();
        box = document.getElementById('primaryClassQuizArea');
        type = document.getElementById('primaryPracticeQuizType')?.value || '';
      } else if(level === 'jss'){
        exam = 'BECE';
        classLevel = 'JSS 3';
        subject = (document.getElementById('jssQuizSubject')?.value || '').trim();
        const ts = document.getElementById('jssQuizTopicSelect'), tm = document.getElementById('jssQuizTopic');
        topic = (((tm?.value||'').trim()) || (ts?.value==='__other__'?'':ts?.value||'')).trim();
        box = document.getElementById('jssQuiz');
        type = document.getElementById('jssQuizType')?.value || '';
      } else if(level === 'jss_class'){
        exam = 'Class Practice';
        classLevel = (document.getElementById('jssPracticeClass')?.value || '').trim();
        subject = (document.getElementById('jssPracticeSubject')?.value || '').trim();
        const ts = document.getElementById('jssPracticeTopicSelect'), tm = document.getElementById('jssPracticeTopic');
        topic = (((tm?.value||'').trim()) || (ts?.value==='__other__'?'':ts?.value||'')).trim();
        box = document.getElementById('jssClassQuiz');
        type = document.getElementById('jssClassQuizType')?.value || '';
      } else if(level === 'sss'){
        exam = 'WASSCE';
        classLevel = 'SSS 3';
        subject = (document.getElementById('sssQuizSubject')?.value || '').trim();
        const ts = document.getElementById('sssQuizTopicSelect'), tm = document.getElementById('sssQuizTopic');
        topic = (((tm?.value||'').trim()) || (ts?.value==='__other__'?'':ts?.value||'')).trim();
        box = document.getElementById('sssQuiz');
        type = document.getElementById('sssQuizType')?.value || '';
      } else if(level === 'sss_class'){
        exam = 'Class Practice';
        classLevel = (document.getElementById('sssPracticeClass')?.value || '').trim();
        subject = (document.getElementById('sssPracticeSubject')?.value || '').trim();
        const ts = document.getElementById('sssPracticeTopicSelect'), tm = document.getElementById('sssPracticeTopic');
        topic = (((tm?.value||'').trim()) || (ts?.value==='__other__'?'':ts?.value||'')).trim();
        box = document.getElementById('sssClassQuiz');
        type = document.getElementById('sssClassQuizType')?.value || '';
      }

      if(repeatSameTopic && lastPracticeTopic[level]){
        topic = lastPracticeTopic[level];
        if(lastPracticeSubject[level]) subject = lastPracticeSubject[level];
      }
      return { level, exam, classLevel, subject, topic, box, type };
    }

    async function startPractice(level, repeatSameTopic=false){
      const cfg = getPracticeConfig(level, repeatSameTopic);
      if(!cfg.box) return;

      if(level.endsWith('_class') && !cfg.classLevel){
        showOutput(cfg.box, 'Please choose your class first.');
        return;
      }
      if(!cfg.subject){
        showOutput(cfg.box, cfg.level === 'primary' ? 'Please choose an NPSE paper first.' : 'Please choose a subject first.');
        return;
      }
      if(!cfg.type){
        showOutput(cfg.box, 'Please choose a question type (Objective or Theory) first.');
        return;
      }

      if(!cfg.topic) cfg.topic = (cfg.classLevel ? cfg.classLevel + ' ' : '') + 'Mixed ' + cfg.exam + ' practice questions in ' + cfg.subject;
      lastPracticeTopic[level] = cfg.topic;
      lastPracticeSubject[level] = cfg.subject;

      saveLastLearningActivity({
        section: cfg.level,
        classLevel: cfg.classLevel,
        subject: cfg.subject,
        topic: cfg.topic,
        tool: cfg.level,
        quizType: cfg.type,
        label: (cfg.classLevel || cfg.exam) + ' ' + cfg.subject + ' – ' + cfg.topic
      });

      if(cfg.type === 'theory'){
        await startTheoryPractice(cfg);
      } else {
        await startObjectivePractice(cfg);
      }
    }

    async function startObjectivePractice(cfg){
      const wanted = QUIZ_ROUND_SIZE;
      showOutput(cfg.box, firstName() ? 'Preparing ' + wanted + ' new ' + (cfg.classLevel || cfg.exam) + ' questions, ' + firstName() + '…' : 'Preparing ' + wanted + ' new ' + (cfg.classLevel || cfg.exam) + ' questions…');
      try{
        const parentLevel = cfg.level.startsWith('primary') ? 'primary' : (cfg.level.startsWith('jss') ? 'jss' : 'sss');
        const questions = await fetchFreshQuestions({
          level: parentLevel,
          class_level: cfg.classLevel,
          subject: cfg.subject,
          topic: cfg.topic,
          exam: cfg.exam,
          count: wanted,
          toolKey: cfg.level + '-' + cfg.exam.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-practice'
        });
        if(questions && questions.length === wanted){
          rememberSeenQuestions(cfg.level, cfg.subject, cfg.topic, questions);
          renderObjectivePractice(cfg, questions);
        } else {
          renderPracticeError(cfg, () => startPractice(cfg.level));
        }
      }catch(e){
        if(e.code === 'registration_required' || e.code === 'payment_required' || e.status === 402){
          handleLearningError(e, cfg.box);
        } else {
          renderPracticeError(cfg, () => startPractice(cfg.level));
        }
      }
    }

    function renderObjectivePractice(cfg, questions){
      const box = cfg.box;
      if(!Array.isArray(questions) || !questions.length){
        renderPracticeError(cfg, () => startPractice(cfg.level));
        return;
      }
      practiceState[cfg.level] = {
        level: cfg.level,
        exam: cfg.exam,
        classLevel: cfg.classLevel,
        subject: cfg.subject,
        topic: cfg.topic,
        questions: questions.slice(0, QUIZ_ROUND_SIZE),
        selected: {},
        answeredCount: 0,
        correct: 0,
        wrong: 0,
        weakAreas: {}
      };

      box.innerHTML =
        '<div class="quiz-head" style="margin-bottom:14px">' +
          '<strong>' + safe(cfg.classLevel || cfg.exam) + ' Objective Practice (' + safe(cfg.subject) + ')</strong><br>' +
          '<span>Click an option to answer each question. Immediate feedback will appear directly below each question.</span>' +
        '</div>' +
        practiceState[cfg.level].questions.map((q, i) => {
          const opts = (q.options || []).slice(0, 4);
          return '<div class="quiz-question" id="' + cfg.level + '_qwrap_' + i + '" data-qindex="' + i + '" style="margin:16px 0;padding:16px;border:1px solid #d7e1ed;border-radius:12px;background:#fff">' +
            '<p style="font-size:1.02rem;margin-top:0"><strong>' + (i + 1) + '. ' + safe(q.question || 'Question') + '</strong></p>' +
            '<div class="quiz-options">' +
              opts.map((opt, j) =>
                '<button type="button" class="btn quiz-option-btn" id="' + cfg.level + '_btn_' + i + '_' + j + '" onclick="answerObjectiveQuestion(\x27' + cfg.level + '\x27, ' + i + ', ' + j + ')">' +
                  '<strong>' + String.fromCharCode(65 + j) + '.</strong> ' + safe(opt) +
                '</button>'
              ).join('') +
            '</div>' +
            '<div class="feedback" id="' + cfg.level + '_obj_fb_' + i + '"></div>' +
          '</div>';
        }).join('') +
        '<div id="' + cfg.level + 'QuizSummary"></div>';
      box.classList.add('show');
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function answerObjectiveQuestion(level, qIndex, optIndex){
      const state = practiceState[level];
      if(!state || state.selected[qIndex] !== undefined) return;
      state.selected[qIndex] = optIndex;
      state.answeredCount = (state.answeredCount || 0) + 1;

      // Disable buttons for this question so learner cannot click multiple times
      for(let j = 0; j < 4; j++){
        const b = document.getElementById(level + '_btn_' + qIndex + '_' + j);
        if(b) b.disabled = true;
      }

      const q = state.questions[qIndex];
      const correctChoice = Number(q.answer);
      const isCorrect = optIndex === correctChoice;
      const fb = document.getElementById(level + '_obj_fb_' + qIndex);

      if(isCorrect){
        state.correct++;
        const userBtn = document.getElementById(level + '_btn_' + qIndex + '_' + optIndex);
        if(userBtn) userBtn.classList.add('correct-choice');
        if(fb){
          fb.innerHTML = '<div style="margin-top:10px;padding:10px 14px;background:#dff5e8;border-left:4px solid #16a34a;border-radius:8px;color:#14532d">' +
            '<strong style="color:#16794b;font-size:1.05rem">✓ Correct!</strong>' +
            (q.explanation ? '<p style="margin:6px 0 0;font-size:0.95rem">' + safe(q.explanation) + '</p>' : '') +
          '</div>';
        }
      } else {
        state.wrong++;
        const userBtn = document.getElementById(level + '_btn_' + qIndex + '_' + optIndex);
        if(userBtn) userBtn.classList.add('wrong-choice');
        const correctBtn = document.getElementById(level + '_btn_' + qIndex + '_' + correctChoice);
        if(correctBtn) correctBtn.classList.add('correct-choice');

        const weak = (q.weakArea || state.topic || state.subject || 'This topic').trim();
        state.weakAreas[weak] = (state.weakAreas[weak] || 0) + 1;
        if(fb){
          fb.innerHTML =
            '<div style="margin-top:10px;padding:12px 14px;background:#fde7e5;border-left:4px solid #dc2626;border-radius:8px;color:#7f1d1d">' +
              '<strong style="color:#b42318;font-size:1.05rem">✗ Incorrect</strong>' +
              '<p style="margin:6px 0 4px"><strong>Correct Answer: ' + String.fromCharCode(65 + correctChoice) + '. ' + safe(q.options[correctChoice]) + '</strong></p>' +
              (q.explanation ? '<p style="margin:4px 0 8px;font-size:0.95rem">' + safe(q.explanation) + '</p>' : '') +
              '<div style="margin-top:8px"><button type="button" class="btn btn-light" id="' + level + '_exp_btn_' + qIndex + '" style="font-size:0.86rem;padding:6px 12px;background:#fff!important;color:#b42318!important;border:1px solid #fca5a5!important;cursor:pointer" onclick="explainWrongAnswer(\x27' + level + '\x27, ' + qIndex + ')">Explain My Wrong Answer</button></div>' +
              '<div id="' + level + '_exp_box_' + qIndex + '" style="display:none;margin-top:8px;padding:10px 12px;background:#fff;border-left:4px solid #b42318;border-radius:6px;color:#1e293b;font-size:0.92rem;line-height:1.5"></div>' +
            '</div>';
        }
      }

      const parentLevel = level.startsWith('primary') ? 'primary' : (level.startsWith('jss') ? 'jss' : 'sss');
      recordPracticeAttempt(parentLevel, state.subject, state.topic, q, optIndex, isCorrect).catch(()=>{});

      // Check if all questions are completed
      if(state.answeredCount === state.questions.length){
        state.submitted = true;
        showObjectiveQuizSummary(state);
        loadLearningProgress().catch(()=>{});
      }
    }

    function showObjectiveQuizSummary(state){
      const level = state.level;
      const summary = document.getElementById(level + 'QuizSummary');
      if(!summary) return;
      const total = state.questions.length;
      const percent = Math.round((state.correct / total) * 100);
      const weak = Object.entries(state.weakAreas).sort((a,b)=>b[1]-a[1]).map(([name,count])=>name+' ('+count+' wrong)').slice(0,5);

      const prevScore = getPreviousPracticeScore(level, state.subject, state.topic);
      let improvementBanner = '';
      if(prevScore !== null){
        if(state.correct > prevScore){
          const diff = state.correct - prevScore;
          improvementBanner = '<div style="margin:12px 0;padding:12px 14px;background:#dff5e8;border:1.5px solid #34d399;border-radius:10px;color:#065f46"><strong>🎉 Great improvement!</strong> You scored <strong>' + state.correct + ' out of ' + total + '</strong> — up from your previous score of ' + prevScore + '/' + total + ' (an improvement of +' + diff + ' ' + (diff === 1 ? 'mark' : 'marks') + ')! Excellent progress!</div>';
        } else if(state.correct === prevScore){
          improvementBanner = '<div style="margin:12px 0;padding:12px 14px;background:#eef4fb;border:1px solid #cbd6e4;border-radius:10px;color:#17324d"><strong>Good consistency!</strong> You scored <strong>' + state.correct + ' out of ' + total + '</strong>, matching your previous score of ' + prevScore + '/' + total + '.</div>';
        } else {
          improvementBanner = '<div style="margin:12px 0;padding:12px 14px;background:#fff8e6;border:1px solid #ffd166;border-radius:10px;color:#7c5200">You scored <strong>' + state.correct + ' out of ' + total + '</strong> (Your previous score was ' + prevScore + '/' + total + '). Practise this topic again to beat your previous score!</div>';
        }
      }
      savePreviousPracticeScore(level, state.subject, state.topic, state.correct);

      let message = '';
      if(percent >= 80) message = 'Very good performance. Review the explanations above, then continue practising.';
      else if(percent >= 60) message = 'Good effort. Review the explanations above before starting another round.';
      else message = 'You need to revise this topic further. Study the explanations and correct answers above, then practise again.';

      summary.innerHTML =
        '<div style="margin-top:22px;padding:18px;border:2px solid #0a5acb;border-radius:14px;background:#f4f8ff">' +
          '<h4 style="margin-top:0;color:#073b8c">Your ' + safe(state.classLevel || state.exam) + ' Practice Results</h4>' +
          '<p style="font-size:1.05rem"><strong>Score:</strong> <span style="font-size:1.25rem;color:#073b8c;font-weight:800">' + state.correct + ' out of ' + total + '</span> (' + percent + '%) &nbsp;|&nbsp; <strong>Wrong:</strong> ' + state.wrong + '</p>' +
          improvementBanner +
          '<p>' + message + '</p>' +
          (weak.length ? '<p><strong>Areas to revise:</strong> ' + weak.map(safe).join(', ') + '.</p>' : '<p><strong>Areas to revise:</strong> No weak areas were identified in this round.</p>') +
          '<div style="margin-top:18px;display:flex;flex-wrap:wrap;gap:10px">' +
            '<button type="button" class="btn btn-blue" onclick="startPractice(\x27' + level + '\x27)">Try New Questions</button>' +
            '<button type="button" class="btn btn-light" onclick="startPractice(\x27' + level + '\x27, true)">Practice This Topic Again</button>' +
          '</div>' +
        '</div>';
      summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function explainWrongAnswer(level, index){
      const state = practiceState[level];
      if(!state || !state.questions[index]) return;
      const q = state.questions[index];
      const userChoice = state.selected[index];
      const correctChoice = Number(q.answer);
      const btn = document.getElementById(level + '_exp_btn_' + index);
      const box = document.getElementById(level + '_exp_box_' + index);
      if(!box) return;
      if(box.style.display !== 'none' && box.getAttribute('data-loaded') === '1'){
        box.style.display = 'none';
        if(btn) btn.textContent = 'Explain My Wrong Answer';
        return;
      }
      box.style.display = 'block';
      box.innerHTML = '<em>Preparing detailed explanation…</em>';
      if(btn) btn.textContent = 'Explaining…';
      try{
        const parentLevel = state.level.startsWith('primary') ? 'primary' : (state.level.startsWith('jss') ? 'jss' : 'sss');
        const res = await learningRequest({
          level: parentLevel,
          class_level: state.classLevel,
          subject: state.subject,
          topic: state.topic,
          task: 'explain_wrong_answer',
          tool_key: level + '-explain-wrong-answer',
          context: 'Question: ' + q.question + '\\nStudent selected: ' + String.fromCharCode(65+userChoice) + '. ' + (q.options[userChoice]||'') + '\\nCorrect answer: ' + String.fromCharCode(65+correctChoice) + '. ' + (q.options[correctChoice]||'') + '\\nTeacher note: ' + (q.explanation||'')
        });
        const explanationText = (res.answer || res.explanation || '').trim();
        if(explanationText){
          box.innerHTML = '<strong style="color:#073b8c;display:block;margin-bottom:6px">Why your choice was incorrect:</strong>' + safe(explanationText);
        } else {
          box.innerHTML = '<strong>Why your choice was incorrect:</strong> You chose <strong>' + String.fromCharCode(65+userChoice) + '. ' + safe(q.options[userChoice]) + '</strong>. The correct answer is <strong>' + String.fromCharCode(65+correctChoice) + '. ' + safe(q.options[correctChoice]) + '</strong>. ' + safe(q.explanation || '');
        }
        box.setAttribute('data-loaded', '1');
        if(btn) btn.textContent = 'Hide Explanation';
      }catch(e){
        box.innerHTML = '<strong>Why your choice was incorrect:</strong> You chose <strong>' + String.fromCharCode(65+userChoice) + '. ' + safe(q.options[userChoice]) + '</strong>. The correct answer is <strong>' + String.fromCharCode(65+correctChoice) + '. ' + safe(q.options[correctChoice]) + '</strong>. ' + safe(q.explanation || '');
        box.setAttribute('data-loaded', '1');
        if(btn) btn.textContent = 'Hide Explanation';
      }
    }

    async function startTheoryPractice(cfg){
      const wanted = THEORY_ROUND_SIZE;
      showOutput(cfg.box, firstName() ? 'Preparing ' + wanted + ' new ' + (cfg.classLevel || cfg.exam) + ' theory questions, ' + firstName() + '…' : 'Preparing ' + wanted + ' new ' + (cfg.classLevel || cfg.exam) + ' theory questions…');
      try{
        const parentLevel = cfg.level.startsWith('primary') ? 'primary' : (cfg.level.startsWith('jss') ? 'jss' : 'sss');
        const res = await learningRequest({
          level: parentLevel,
          class_level: cfg.classLevel,
          subject: cfg.subject,
          topic: cfg.topic,
          exam: cfg.exam,
          task: 'theory_quiz',
          question_count: wanted,
          tool_key: cfg.level + '-' + cfg.exam.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-theory-practice',
          context: 'Generate exactly 3 theory examination questions for ' + cfg.exam + (cfg.classLevel ? ' (' + cfg.classLevel + ') ' : ' ') + cfg.subject + ' on ' + cfg.topic + '. Questions must strictly match the selected class, subject and topic. Include model answers and key marking points.'
        });
        const questions = Array.isArray(res.questions) ? res.questions.slice(0, wanted) : [];
        if(questions.length === wanted){
          renderTheoryPractice(cfg, questions);
        } else {
          renderPracticeError(cfg, () => startPractice(cfg.level));
        }
      }catch(e){
        if(e.code === 'registration_required' || e.code === 'payment_required' || e.status === 402){
          handleLearningError(e, cfg.box);
        } else {
          renderPracticeError(cfg, () => startPractice(cfg.level));
        }
      }
    }

    function renderTheoryPractice(cfg, questions){
      const box = cfg.box;
      theoryPracticeState[cfg.level] = {
        level: cfg.level,
        exam: cfg.exam,
        classLevel: cfg.classLevel,
        subject: cfg.subject,
        topic: cfg.topic,
        questions,
        submitted: false
      };

      box.innerHTML =
        '<div class="quiz-head" style="margin-bottom:16px">' +
          '<strong>' + safe(cfg.classLevel || cfg.exam) + ' Theory Practice (' + safe(cfg.subject) + ')</strong><br>' +
          '<span>Answer the questions below in your own words. Click <strong>Submit Answers</strong> to receive constructive educational feedback, analysis of what you got right and missing points, and model answers.</span>' +
        '</div>' +
        questions.map((q, i) =>
          '<div class="theory-question-card" data-qindex="' + i + '" style="margin:16px 0;padding:16px;border:1px solid #d7e1ed;border-radius:12px;background:#fff">' +
            '<p style="font-size:1.02rem;margin-top:0"><strong>Question ' + (i + 1) + '.</strong> ' + safe(q.question) + '</p>' +
            '<label for="' + cfg.level + '_theory_ans_' + i + '" style="display:block;margin:10px 0 4px;font-weight:600;color:#334155;font-size:0.92rem">Type Your Answer</label>' +
            '<textarea id="' + cfg.level + '_theory_ans_' + i + '" class="theory-answer-box" placeholder="Type your answer here..." rows="4"></textarea>' +
            '<div id="' + cfg.level + '_theory_fb_' + i + '" style="display:none;margin-top:12px"></div>' +
          '</div>'
        ).join('') +
        '<div id="' + cfg.level + '_theory_action_area" style="margin-top:20px;text-align:center">' +
          '<button type="button" class="btn btn-blue" id="' + cfg.level + '_submit_theory_btn" onclick="submitTheoryPractice(\x27' + cfg.level + '\x27)" style="padding:12px 28px;font-size:1.05rem;font-weight:700">Submit Answers</button>' +
          '<div id="' + cfg.level + '_theory_status" style="margin-top:10px;font-weight:600;color:#073b8c"></div>' +
        '</div>' +
        '<div id="' + cfg.level + '_theory_summary" style="margin-top:20px"></div>';
      box.classList.add('show');
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function submitTheoryPractice(level){
      const state = theoryPracticeState[level];
      if(!state || state.submitted) return;
      const answers = [];
      let hasAny = false;
      for(let i = 0; i < state.questions.length; i++){
        const val = (document.getElementById(level + '_theory_ans_' + i)?.value || '').trim();
        answers.push(val);
        if(val) hasAny = true;
      }
      const statusEl = document.getElementById(level + '_theory_status');
      if(!hasAny){
        if(statusEl) statusEl.textContent = 'Please type your answer in the answer boxes before submitting.';
        return;
      }

      state.submitted = true;
      for(let i = 0; i < state.questions.length; i++){
        const ta = document.getElementById(level + '_theory_ans_' + i);
        if(ta) ta.disabled = true;
      }
      const submitBtn = document.getElementById(level + '_submit_theory_btn');
      if(submitBtn) submitBtn.disabled = true;
      if(statusEl) statusEl.textContent = 'AI is assessing your answers and preparing feedback…';

      try{
        const parentLevel = state.level.startsWith('primary') ? 'primary' : (state.level.startsWith('jss') ? 'jss' : 'sss');
        const markRes = await learningRequest({
          level: parentLevel,
          class_level: state.classLevel,
          subject: state.subject,
          topic: state.topic,
          exam: state.exam,
          task: 'mark_theory',
          tool_key: level + '-' + state.exam.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-theory-marking',
          context: JSON.stringify({
            exam: state.exam,
            class_level: state.classLevel,
            subject: state.subject,
            topic: state.topic,
            submissions: state.questions.map((q, idx) => ({
              question_number: idx + 1,
              question: q.question,
              model_answer: q.model_answer,
              student_answer: answers[idx] || '(No answer provided)'
            }))
          })
        });

        if(submitBtn) submitBtn.style.display = 'none';
        if(statusEl) statusEl.style.display = 'none';

        const feedbackList = Array.isArray(markRes.feedback) ? markRes.feedback : [];
        for(let i = 0; i < state.questions.length; i++){
          const fbBox = document.getElementById(level + '_theory_fb_' + i);
          if(!fbBox) continue;
          const fb = feedbackList[i] || {};
          const modelAns = fb.model_answer || state.questions[i]?.model_answer || 'Complete answer aligned with Sierra Leone curriculum.';
          const correctText = fb.correct_points || (answers[i] ? 'Answer reviewed.' : 'No answer was provided for this question.');
          const improveText = fb.needs_improvement || 'Compare your answer with the model answer below.';

          fbBox.style.display = 'block';
          fbBox.innerHTML =
            '<div style="background:#f8fafc;border:1px solid #cbd6e4;border-radius:10px;padding:14px;margin-top:12px">' +
              '<h4 style="margin:0 0 10px;color:#073b8c">Feedback for Question ' + (i + 1) + '</h4>' +
              '<div style="background:#ecfdf5;border-left:4px solid #10b981;padding:10px 12px;border-radius:6px;margin-bottom:8px;color:#064e3b">' +
                '<strong>What you got right:</strong> ' + safe(correctText) +
              '</div>' +
              '<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 12px;border-radius:6px;margin-bottom:8px;color:#78350f">' +
                '<strong>Important points missing / How to improve:</strong> ' + safe(improveText) +
              '</div>' +
              (fb.score_comment ? '<div style="font-weight:600;color:#1e3a8a;margin-bottom:8px">Assessment: ' + safe(fb.score_comment) + '</div>' : '') +
              '<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px;border-radius:6px;margin-top:10px;color:#1e3a8a">' +
                '<strong>Suggested Model Answer:</strong>' +
                '<div style="margin-top:6px;line-height:1.5;white-space:pre-wrap">' + safe(modelAns) + '</div>' +
              '</div>' +
            '</div>';
        }

        const summaryBox = document.getElementById(level + '_theory_summary');
        if(summaryBox){
          summaryBox.innerHTML =
            '<div style="margin-top:22px;padding:18px;border:2px solid #0a5acb;border-radius:14px;background:#f4f8ff">' +
              '<h4 style="margin-top:0;color:#073b8c">' + safe(state.classLevel || state.exam) + ' Theory Practice Complete</h4>' +
              '<p>' + safe(markRes.overall_summary || 'Your theory answers have been assessed. Review the constructive feedback and model answers above.') + '</p>' +
              '<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px">' +
                '<button type="button" class="btn btn-blue" onclick="startPractice(\x27' + level + '\x27)">Try New Questions</button>' +
                '<button type="button" class="btn btn-light" onclick="startPractice(\x27' + level + '\x27, true)">Practice This Topic Again</button>' +
              '</div>' +
            '</div>';
          summaryBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }catch(e){
        if(submitBtn) submitBtn.disabled = false;
        if(statusEl) statusEl.textContent = e.message || 'Marking failed. Please try clicking Submit Answers again.';
      }
    }

    function startQuiz(level){ startPractice(level); }
    function startNPSEQuiz(){ startPractice('primary'); }`;

const startIdx = html.indexOf('    // ----- Unified Exam Practice (NPSE, BECE, WASSCE) -----');
const endMarker = "    function startNPSEQuiz(){ startPractice('primary'); }";
const endIdx = html.indexOf(endMarker);

if(startIdx !== -1 && endIdx !== -1){
  html = html.substring(0, startIdx) + newPracticeScript + html.substring(endIdx + endMarker.length);
  fs.writeFileSync('index.html', html);
  console.log('Practice JS script updated successfully!');
} else {
  console.error('Could not find start or end index', startIdx, endIdx);
  process.exit(1);
}
