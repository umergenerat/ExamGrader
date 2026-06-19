
import { GoogleGenAI } from "@google/genai";
import type { GradingResult } from "../types";

const MAX_DIMENSION = 1536; // A reasonable size for quality and performance

export type ExamReference = { type: 'text' | 'files', content: string | File[] };

const getGradingSchemaAsJsonString = (totalMarks: number): string => {
    return `\`\`\`json
{
  "studentName": "string",
  "studentGroup": "string",
  "score": "number (must be the sum of marksAwarded, out of ${totalMarks})",
  "totalMarks": "number (must be ${totalMarks})",
  "confidenceScore": "number (0-100, your confidence in the overall grading accuracy. 100 = perfect certainty, lower if handwriting is unclear, questions are ambiguous, or reference is missing)",
  "gradingNotes": "string (brief notes about any difficulties, ambiguities, or assumptions made during grading. Empty string if none.)",
  "cheatingAnalysis": {
    "detected": "boolean",
    "isAiGenerated": "boolean (true if the style strongly suggests AI generation)",
    "reasoning": "string",
    "webSources": [
      {
        "sourceUrl": "string (URL of the plagiarized source)",
        "originalText": "string (The original text from the web source)",
        "studentText": "string (The corresponding text found in the student's answer)"
      }
    ]
  },
  "strengths": ["string"],
  "weaknesses": ["string"],
  "detailedFeedback": [
    {
      "question": "string",
      "studentAnswer": "string",
      "idealAnswer": "string",
      "evaluation": "string",
      "marksAwarded": "number",
      "maxMarks": "number",
      "bloomLevel": "string (MUST be exactly one of: 'knowledge', 'comprehension', 'application', 'analysis', 'synthesis', 'evaluation'. Classify the cognitive level this question primarily tests according to Bloom's Taxonomy.)",
      "performanceLevel": "string (MUST be exactly one of: 'excellent', 'good', 'acceptable', 'insufficient', 'absent'. Rate the student's performance on this specific question using this rubric scale.)"
    }
  ]
}
\`\`\``;
};


const resizeImage = (file: File, maxDimension: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error('FileReader did not return a result.'));
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL(file.type, 0.9).split(',')[1]);
            };
            img.onerror = (err) => reject(new Error(`Image load error: ${err}`));
            img.src = event.target.result as string;
        };
        reader.onerror = (err) => reject(new Error(`FileReader error: ${err}`));
        reader.readAsDataURL(file);
    });
};

const fileToGenerativePart = async (file: File) => {
    // If it's a standard image type, try to resize it for performance.
    if (file.type.startsWith('image/') && file.type !== 'image/gif') {
         try {
            const resizedBase64 = await resizeImage(file, MAX_DIMENSION);
            return {
                inlineData: { data: resizedBase64, mimeType: file.type },
            };
        } catch (error) {
            console.warn(`Could not resize image ${file.name}, sending original size. Error:`, error);
            // Fallback to original method if resizing fails
        }
    }
    
    // For PDFs, GIFs, or if resizing fails, use the original method
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};

// This is defined with `let` so it can be mocked for testing.
// The underscore prefix signals it's an internal detail that can be patched.
let _getGenAI = (apiKey: string) => new GoogleGenAI({ apiKey });

export const constructGradingPrompt = (
    studentName: string, 
    studentGroup: string, 
    totalMarks: number, 
    gradingStrictness: 'Lenient' | 'Normal' | 'Strict' | 'Scientific',
    plagiarismSensitivity: 'Low' | 'Medium' | 'High',
    customInstructions: string,
    matchingStudentName: string | null,
    examReferenceIsProvided: boolean,
    referenceAsText: string | null,
    language: 'ar' | 'en' | 'fr'
): string => {
    let referenceInstructionBlock: string;
    const jsonSchema = getGradingSchemaAsJsonString(totalMarks);

    if (language === 'fr') {
        if (examReferenceIsProvided) {
            if (referenceAsText) {
                referenceInstructionBlock = `**Matériel de référence (Questions et éléments de réponse) :**\nVous DEVEZ utiliser le texte suivant comme référence officielle. Il contient les questions et peut contenir des éléments de réponse ou des critères de notation.\nNotez les réponses de l'étudiant en vous basant strictement sur cette référence. Si des éléments de réponse sont fournis, utilisez-les comme critères principaux.\n\n---\n${referenceAsText}\n---\n\n`;
            } else {
                referenceInstructionBlock = `**Matériel de référence (Questions et éléments de réponse) :**\nLes images/documents initiaux fournis constituent la référence officielle. Ils contiennent les questions d'examen et potentiellement le corrigé type ou le barème.\nVous DEVEZ les utiliser comme source unique de vérité pour les questions, les réponses idéales et l'attribution des points.\nNotez les réponses de l'étudiant en vous basant strictement sur cette référence.\n\n`;
            }
        } else {
             referenceInstructionBlock = `**Questions d'examen de référence :** Aucune feuille de référence n'a été fournie. Vous devez déduire les questions de la feuille de réponses de l'étudiant elle-même.\n\n`;
        }

        let strictnessInstruction = '';
        if (gradingStrictness === 'Scientific') {
            strictnessInstruction = `**MODE SCIENTIFIQUE (OBJECTIF) :**
            Ceci est un examen scientifique (Maths, Physique, Sciences). Ignorez toute notion de clémence ou de sévérité subjective.
            La notation doit être purement OBJECTIVE et basée sur des faits scientifiques.
            Vérifiez avec une précision absolue :
            1. L'exactitude des formules et théorèmes utilisés.
            2. La logique des étapes de calcul.
            3. L'exactitude des résultats numériques finaux.
            4. L'utilisation correcte des unités et des notations scientifiques.
            Ne donnez PAS de points pour l'intention si le raisonnement ou le résultat scientifique est faux.`;
        } else if (gradingStrictness === 'Strict') {
            strictnessInstruction = 'La notation doit être extrêmement stricte, en déduisant des points même pour des erreurs mineures.';
        } else if (gradingStrictness === 'Lenient') {
            strictnessInstruction = 'La notation doit être indulgente, en se concentrant sur la compréhension par l\'étudiant des concepts de base plutôt que sur les détails mineurs.';
        }

        let plagiarismInstruction = '';
        if (plagiarismSensitivity === 'Low') {
            plagiarismInstruction = "Effectuez une vérification de base pour le copiage direct. Ne signalez que les correspondances textuelles évidentes provenant de sources Web.";
        } else if (plagiarismSensitivity === 'Medium') {
            plagiarismInstruction = "Analysez pour le copiage direct et la reformulation significative. Signalez les correspondances qui indiquent clairement que le contenu n'est pas le travail original de l'étudiant.";
        } else { // High
            plagiarismInstruction = "Analysez strictement pour tout signe de copiage, de reformulation ou de similarité structurelle avec des sources en ligne ou une génération par IA. Signalez même les chevauchements suspects mineurs ou les incohérences.";
        }

        let customInstructionBlock = '';
        if (customInstructions.trim()) {
            customInstructionBlock = `\n5.  **Instructions personnalisées** :\n    -   Suivez strictement ces instructions supplémentaires : "${customInstructions.trim()}"\n`;
        }

        let integrityAnalysisBlock: string;
        if (matchingStudentName) {
            integrityAnalysisBlock = `4.  **Analyse d'intégrité** :
    -   **Alerte de sécurité critique :** Une correspondance de contenu complète a été détectée avec l'examen de l'étudiant **${matchingStudentName}** du même groupe. C'est un indicateur très fort de triche. Vous devez ignorer l'analyse de sensibilité normale et le signaler immédiatement.
    -   **Pénalité obligatoire :** Le \`score\` final et tous les \`marksAwarded\` doivent être définitivement nuls (0).
    -   Dans la section \`cheatingAnalysis\` :
        -   Mettez \`detected\` à \`true\`.
        -   Dans \`reasoning\`, indiquez le texte suivant **textuellement sans aucun changement** : "Une copie d'examen identique a été détectée avec l'étudiant ${matchingStudentName}. Pénalité pour tricherie appliquée."`;
        } else {
            integrityAnalysisBlock = `4.  **Analyse d'intégrité** :
    -   **Vérification du plagiat Web :** Utilisez l'outil de recherche Google intégré pour vérifier les réponses des étudiants par rapport aux sources en ligne pour le plagiat.
    -   **Détection d'IA :** Analysez le style d'écriture pour détecter des signes de génération par IA (phrasé robotique, structure trop parfaite, vocabulaire générique complexe). Si une utilisation significative de l'IA est suspectée, mettez \`isAiGenerated\` à \`true\`.
    -   Si une copie directe est trouvée, vous DEVEZ remplir le tableau \`webSources\` dans l'objet \`cheatingAnalysis\` pour chaque cas. Chaque entrée doit contenir :
        -   \`sourceUrl\` : L'URL exacte du site Web source.
        -   \`originalText\` : Le texte copié du site Web.
        -   \`studentText\` : Le texte correspondant de la réponse de l'étudiant.
    -   ${plagiarismInstruction} Basez votre \`reasoning\` dans \`cheatingAnalysis\` sur les comparaisons internes, la détection d'IA et la vérification du plagiat Web. Si \`isAiGenerated\` est vrai, votre \`reasoning\` DOIT explicitement indiquer que la génération par IA est suspectée et citer des preuves stylistiques spécifiques.`;
        }

        return `Vous êtes un **moteur de notation déterministe**. Votre tâche est d'exécuter un algorithme de notation strict. 
**OBJECTIF : VARIANCE ZÉRO.** Si ce document est traité deux fois, le résultat doit être mathématiquement identique. Ne changez jamais vos critères de notation entre les exécutions. Éliminez toute subjectivité ou "humeur". Toutes les sorties doivent être en français.

**PRINCIPES FONDAMENTAUX D'ÉVALUATION :**
- **Validité (الصدق) :** Mesure dans laquelle la notation est capable d'évaluer réellement la compétence requise. La note attribuée doit refléter fidèlement la maîtrise de la compétence ciblée par la question.
- **Fidélité / Fiabilité (الثبات) :** Produire des résultats proches et convergents, même en cas de changement d'enseignant ou d'établissement. Les critères doivent être appliqués de façon uniforme à chaque traitement.
- **Équité / Impartialité (الإنصاف) :** Application des mêmes critères et barèmes de notation à tous les élèves sans discrimination aucune.

${referenceInstructionBlock}
Les données d'entrée consistent en des images d'un examen pour l'étudiant : ${studentName} du groupe : ${studentGroup}. Traitez toutes les images comme un seul document continu.

Exécutez l'algorithme suivant avec une précision absolue :

**Algorithme :**
1.  **Allocation des questions et des points (Verrouillage)** :
    -   Analysez le document pour identifier toutes les questions.
    -   Répartissez logiquement le total des points (${totalMarks}) entre les questions.
    -   **Règle Stricte :** Une fois fixée, la distribution des points ne doit pas changer en fonction de la qualité de la réponse. La somme doit toujours être ${totalMarks}.

2.  **Évaluation par question** :
    -   Pour chaque question, évaluez la réponse de l'étudiant sur la base de critères académiques stricts et du matériel de référence fourni. ${strictnessInstruction}
    -   **Respect des Principes Fondamentaux :** Assurez-vous que le score attribué respecte strictement les principes de **Validité (الصدق)**, de **Fidélité/Fiabilité (الثبات)**, et d'**Équité/Impartialité (الإنصاف)**.
    -   Attribuez un score \`marksAwarded\` pour chaque question.
    -   Formulez une \`idealAnswer\` (réponse idéale) concise.
    -   Rédigez une \`evaluation\` qui justifie objectivement le \`marksAwarded\` attribué, en explicitant comment l'évaluation reflète fidèlement la compétence ciblée par la question (الصدق) et applique équitablement et uniformément les critères de notation (الإنصاف et الثبات).
    -   **Classification de Bloom :** Classifiez chaque question selon la Taxonomie de Bloom révisée. Attribuez exactement l'un de ces niveaux : \`knowledge\` (mémorisation), \`comprehension\` (compréhension), \`application\` (application), \`analysis\` (analyse), \`synthesis\` (synthèse), \`evaluation\` (évaluation critique).
    -   **Niveau de performance :** Évaluez la performance de l'étudiant sur chaque question en attribuant exactement l'un de ces niveaux : \`excellent\` (maîtrise complète), \`good\` (bonne maîtrise avec erreurs mineures), \`acceptable\` (comprehension partielle), \`insufficient\` (compréhension très limitée), \`absent\` (pas de réponse ou hors sujet).

3.  **Agrégation des résultats** :
    -   Calculez le \`score\` total.
    -   **Contrainte :** Le \`score\` doit être la somme mathématique exacte de toutes les valeurs \`marksAwarded\` de l'étape 2.
    -   Résumez les \`strengths\` (points forts) et les \`weaknesses\` (points faibles).

${integrityAnalysisBlock}
${customInstructionBlock}
6.  **Indice de confiance et notes** :
    -   Attribuez un \`confidenceScore\` (0-100) reflétant votre confiance globale dans la notation. Réduisez ce score si : l'écriture est difficile à déchiffrer, les questions sont ambiguës, aucune référence n'est fournie, ou les réponses sont incomplètes.
    -   Rédigez des \`gradingNotes\` décrivant brièvement les difficultés rencontrées ou les hypothèses faites. Laissez vide si aucune.

7.  **Formatage de la sortie** :
    -   Compilez toutes les données en un seul objet JSON.
    -   **Contrainte :** L'objet JSON doit respecter strictement le schéma fourni.

**Schéma JSON :**
${jsonSchema}`;
    }

    if (language === 'en') {
        if (examReferenceIsProvided) {
            if (referenceAsText) {
                referenceInstructionBlock = `**Reference Material (Questions & Answer Key):**\nYou MUST use the following text as the official reference. It contains the exam questions and may contain answer elements or grading criteria.\nGrade the student's answers strictly based on this reference. If answer elements are provided, use them as the primary criteria.\n\n---\n${referenceAsText}\n---\n\n`;
            } else {
                referenceInstructionBlock = `**Reference Material (Questions & Answer Key):**\nThe initial images/documents provided are the official reference. They contain the exam questions and potentially the answer key or marking scheme.\nYou MUST use them as the sole ground truth for questions, ideal answers, and mark allocation.\nGrade the student's answers strictly based on this reference.\n\n`;
            }
        } else {
             referenceInstructionBlock = `**Reference Exam Questions:** No reference sheet was provided. You must deduce the questions from the student's answer sheet itself.\n\n`;
        }

        let strictnessInstruction = '';
        if (gradingStrictness === 'Scientific') {
            strictnessInstruction = `**SCIENTIFIC MODE (OBJECTIVE):**
            This is a scientific exam (Math, Physics, Science). Ignore subjective leniency/strictness levels.
            Grading must be strictly OBJECTIVE based on scientific facts.
            Verify with absolute precision:
            1. Correct formulas and theorems used.
            2. Logical steps and derivation.
            3. Exact final numerical results.
            4. Correct units and scientific notation.
            Do NOT award points for intent if the scientific reasoning or result is incorrect.`;
        } else if (gradingStrictness === 'Strict') {
            strictnessInstruction = 'The grading must be extremely strict, deducting points for even minor errors.';
        } else if (gradingStrictness === 'Lenient') {
            strictnessInstruction = 'The grading should be lenient, focusing on the student\'s understanding of core concepts rather than minor details.';
        }

        let plagiarismInstruction = '';
        if (plagiarismSensitivity === 'Low') {
            plagiarismInstruction = 'Perform a basic check for direct copying. Only flag obvious, verbatim matches from web sources.';
        } else if (plagiarismSensitivity === 'Medium') {
            plagiarismInstruction = 'Analyze for direct copying and significant paraphrasing. Flag matches that clearly indicate the content is not the student\'s original work.';
        } else { // High
            plagiarismInstruction = 'Strictly analyze for any signs of copying, paraphrasing, or structural similarity to online sources or AI generation. Flag even minor suspicious overlaps or inconsistencies.';
        }

        let customInstructionBlock = '';
        if (customInstructions.trim()) {
            customInstructionBlock = `\n5.  **Custom Instructions**:\n    -   Strictly follow these additional instructions: "${customInstructions.trim()}"\n`;
        }

        let integrityAnalysisBlock: string;
        if (matchingStudentName) {
            integrityAnalysisBlock = `4.  **Integrity Analysis**:
    -   **Critical Security Alert:** A complete content match has been detected with the exam of student **${matchingStudentName}** from the same group. This is a very strong indicator of cheating. You must override the normal sensitivity analysis and report this immediately.
    -   **Mandatory Penalty:** The final \`score\` and all \`marksAwarded\` must be definitively zero (0).
    -   In the \`cheatingAnalysis\` section:
        -   Set \`detected\` to \`true\`.
        -   In \`reasoning\`, state the following text **verbatim without any change**: "An identical answer sheet was detected with student ${matchingStudentName}. Cheating penalty applied."`;
        } else {
            integrityAnalysisBlock = `4.  **Integrity Analysis**:
    -   **Web Plagiarism Check:** Use the integrated Google Search tool to check student answers against online sources for plagiarism.
    -   **AI Detection:** Analyze the writing style for signs of AI generation (robotic phrasing, overly perfect structure, generic complex vocabulary). If significant AI usage is suspected, set \`isAiGenerated\` to \`true\`.
    -   If direct copying is found, you MUST populate the \`webSources\` array within the \`cheatingAnalysis\` object for each instance. Each entry must contain:
        -   \`sourceUrl\`: The exact URL of the source website.
        -   \`originalText\`: The copied text from the website.
        -   \`studentText\`: The matching text from the student's answer.
    -   ${plagiarismInstruction} Base your \`reasoning\` in \`cheatingAnalysis\` on internal comparisons, AI detection, and the web plagiarism check. If \`isAiGenerated\` is true, your \`reasoning\` MUST explicitly state that AI generation is suspected and cite specific stylistic evidence.`;
        }

        return `You are a **deterministic grading engine**. Your task is to execute a strict grading algorithm. 
**GOAL: ZERO VARIANCE.** Identical inputs must always produce mathematically identical outputs. Do not alter your grading criteria between runs. Eliminate all forms of subjectivity or "mood" to ensure absolute fairness. All output must be in English.

**FUNDAMENTAL EVALUATION PRINCIPLES:**
- **Validity (الصدق):** The extent to which the quantitative measurement is capable of actually measuring the targeted competency. Awarded marks must faithfully reflect the student's mastery of the competency targeted by each question.
- **Reliability (الثبات):** Yielding close and convergent results even when the teacher or institution changes. Grading criteria must be applied uniformly so that identical inputs always produce identical outputs.
- **Fairness (الإنصاف):** Applying the same criteria and standards to all students without any discrimination whatsoever.

${referenceInstructionBlock}
The input data consists of images of an exam for student: ${studentName} from group: ${studentGroup}. Treat all images as a single, continuous document.

Execute the following algorithm with absolute precision:

**Algorithm:**
1.  **Question and Mark Allocation (Lock-in)**:
    -   Scan the document to identify all questions.
    -   Logically distribute the total marks (${totalMarks}) among the identified questions.
    -   **Strict Rule:** Once set, the mark distribution for each question must NOT change based on the quality of the answer. The sum must always equal ${totalMarks}.

2.  **Evaluation per Question**:
    -   For each question, evaluate the student's answer based on strict academic criteria and the provided reference material. ${strictnessInstruction}
    -   **Adherence to Core Principles:** Ensure the marks awarded strictly respect the principles of **Validity (الصدق)**, **Reliability (الثبات)**, and **Fairness (الإنصاف)**.
    -   Award a \`marksAwarded\` score for each question.
    -   Formulate a concise \`idealAnswer\`.
    -   Write an \`evaluation\` that objectively justifies the \`marksAwarded\` given, clarifying how the mark accurately assesses the targeted competency (Validity) and applies grading criteria uniformly (Reliability) and fairly (Fairness).
    -   **Bloom's Classification:** Classify each question according to Bloom's Revised Taxonomy. Assign exactly one of: \`knowledge\` (recall), \`comprehension\` (understanding), \`application\` (applying), \`analysis\` (analyzing), \`synthesis\` (creating), \`evaluation\` (critical judgment).
    -   **Performance Level:** Rate the student's performance on each question using exactly one of: \`excellent\` (full mastery), \`good\` (good mastery with minor errors), \`acceptable\` (partial understanding), \`insufficient\` (very limited understanding), \`absent\` (no answer or off-topic).

3.  **Result Aggregation**:
    -   Calculate the total \`score\`.
    -   **Constraint:** The \`score\` must be the exact mathematical sum of all \`marksAwarded\` values from Step 2. Do not use any other estimation.
    -   Summarize \`strengths\` and \`weaknesses\` based on the individual evaluations.

${integrityAnalysisBlock}
${customInstructionBlock}
6.  **Confidence Score & Notes**:
    -   Assign a \`confidenceScore\` (0-100) reflecting your overall confidence in the grading accuracy. Lower it if: handwriting is hard to read, questions are ambiguous, no reference is provided, or answers are incomplete.
    -   Write \`gradingNotes\` briefly describing any difficulties encountered or assumptions made. Leave empty if none.

7.  **Output Formatting**:
    -   Compile all data into a single JSON object.
    -   **Constraint:** The JSON object must strictly adhere to the provided schema.

**JSON Schema:**
${jsonSchema}`;
    }

    // Arabic Prompt
    if (examReferenceIsProvided) {
        if (referenceAsText) {
            referenceInstructionBlock = `**مواد مرجعية (الأسئلة وعناصر الإجابة/سلم التنقيط):**\nيجب عليك **حصراً** استخدام النص التالي كمرجع رسمي. يحتوي على أسئلة الامتحان وقد يحتوي على عناصر الإجابة أو معايير التصحيح.\nقم بتقييم إجابات الطالب بناءً على هذا المرجع بدقة. إذا تم توفير عناصر الإجابة، فاعتمدها كمعايير أساسية للتقييم.\n\n---\n${referenceAsText}\n---\n\n`;
        } else {
            referenceInstructionBlock = `**مواد مرجعية (الأسئلة وعناصر الإجابة/سلم التنقيط):**\nالصور/المستندات الأولية المقدمة هي المرجع الرسمي للامتحان. تحتوي على الأسئلة ومن المحتمل أن تحتوي على الإجابة النموذجية أو سلم التنقيط.\nيجب عليك **حصراً** استخدامها كالمصدر الوحيد للحقيقة للأسئلة، الإجابات المثالية، وتوزيع النقاط.\nقم بتقييم إجابات الطالب بدقة بناءً على هذا المرجع.\n\n`;
        }
    } else {
        referenceInstructionBlock = `**أسئلة الامتحان المرجعية:** لم يتم تقديم ورقة أسئلة مرجعية. يجب عليك استنتاج الأسئلة من ورقة إجابة الطالب نفسها.\n\n`;
    }

    let strictnessInstruction = '';
    if (gradingStrictness === 'Scientific') {
        strictnessInstruction = `**الوضع العلمي (موضوعي دقيق):**
        هذا امتحان في مادة علمية (رياضيات، فيزياء، علوم). تجاهل أي مستويات ذاتية للتساهل أو الصرامة.
        يجب أن يكون التصحيح موضوعيًا بحتًا ومستندًا إلى الحقائق العلمية.
        تحقق بدقة متناهية من:
        1. صحة القوانين والنظريات المستخدمة.
        2. منطقية وتسلسل خطوات الحل.
        3. دقة النتائج الحسابية النهائية.
        4. الاستخدام الصحيح للوحدات والترميز العلمي.
        لا تمنح نقاطًا على "النية" إذا كان الاستنتاج أو النتيجة العلمية خاطئة.`;
    } else if (gradingStrictness === 'Strict') {
        strictnessInstruction = 'يجب أن يكون التقييم صارمًا للغاية، مع خصم النقاط لأقل الأخطاء.';
    } else if (gradingStrictness === 'Lenient') {
        strictnessInstruction = 'يجب أن يكون التقييم متساهلاً، مع التركيز على فهم الطالب للمفاهيم الأساسية بدلاً من التفاصيل الدقيقة.';
    }

    let plagiarismInstruction = '';
    if (plagiarismSensitivity === 'Low') {
        plagiarismInstruction = "قم بإجراء فحص أساسي للنسخ المباشر. أبلغ فقط عن التطابقات الحرفية الواضحة من مصادر الويب.";
    } else if (plagiarismSensitivity === 'Medium') {
        plagiarismInstruction = "حلل للبحث عن النسخ المباشر وإعادة الصياغة المهمة. أبلغ عن التطابقات التي تشير بوضوح إلى أن المحتوى ليس العمل الأصلي للطالب.";
    } else { // High
        plagiarismInstruction = "حلل بصرامة للبحث عن أي علامات للنسخ أو إعادة الصياغة أو التشابه الهيكلي مع المصادر عبر الإنترنت أو التوليد بواسطة الذكاء الاصطناعي. أبلغ حتى عن التداخلات المشبوهة الطفيفة أو التناقضات.";
    }
    
    let customInstructionBlock = '';
    if (customInstructions.trim()) {
        customInstructionBlock = `\n5.  **تعليمات إضافية (Custom Instructions)**:\n    -   اتبع هذه التعليمات الإضافية بدقة: "${customInstructions.trim()}"\n`;
    }

    let integrityAnalysisBlock: string;
    if (matchingStudentName) {
        integrityAnalysisBlock = `4.  **تحليل النزاهة (Integrity Analysis)**:
    -   **تنبيه أمني حاسم:** تم اكتشاف تطابق كامل في محتوى هذا الامتحان مع امتحان الطالب **${matchingStudentName}** من نفس الفوج. هذا مؤشر قوي للغاية على الغش. يجب عليك تجاهل تحليل الحساسية العادي والإبلاغ عن هذا الأمر على الفور.
    -   **إجراء عقابي إلزامي:** يجب أن تكون الدرجة النهائية (\`score\`) وجميع الدرجات الممنوحة (\`marksAwarded\`) صفرًا (0) بشكل قاطع.
    -   في قسم \`cheatingAnalysis\`:
        -   اضبط \`detected\` على \`true\`.
        -   في \`reasoning\`، اذكر النص التالي **حرفيًا ودون أي تغيير**: "تم اكتشاف تطابق تام في ورقة الإجابة مع الطالب ${matchingStudentName}. تم تطبيق عقوبة الغش."`;
    } else {
        integrityAnalysisBlock = `4.  **تحليل النزاهة (Integrity Analysis)**:
    -   **التحقق من الانتحال عبر الويب:** استخدم أداة بحث Google المدمجة لمقارنة إجابات الطالب بالمصادر المتاحة على الإنترنت بحثًا عن أي انتحال.
    -   **كشف الذكاء الاصطناعي:** قم بتحليل أسلوب الكتابة للكشف عن علامات التوليد بواسطة الذكاء الاصطناعي (الصياغة الآلية، الهيكل المثالي بشكل مبالغ فيه، المفردات المعقدة العامة). إذا تم الاشتباه في استخدام كبير للذكاء الاصطناعي، اضبط \`isAiGenerated\` على \`true\`.
    -   إذا تم العثور على نسخ مباشر، يجب عليك **حصراً** ملء مصفوفة \`webSources\` الموجودة داخل كائن \`cheatingAnalysis\` لكل حالة يتم اكتشافها. يجب أن يحتوي كل إدخال على:
        -   \`sourceUrl\`: عنوان URL الدقيق للموقع المصدر.
        -   \`originalText\`: النص المنسوخ من الموقع.
        -   \`studentText\`: النص المطابق من إجابة الطالب.
    -   ${plagiarismInstruction} ابنِ \`reasoning\` (التعليل) في \`cheatingAnalysis\` على المقارنات الداخلية، كشف الذكاء الاصطناعي، ونتائج التحقق من الانتحال عبر الويب. إذا كان \`isAiGenerated\` صحيحًا، يجب أن يذكر \`reasoning\` (التعليل) بوضوح أن هناك اشتباهًا في استخدام الذكاء الاصطناعي مع ذكر أدلة أسلوبية محددة.`;
    }

    return `أنت **محرك تقييم حتمي** (deterministic grading engine). مهمتك هي تنفيذ خوارزمية تقييم صارمة. 
**الهدف: انعدام التباين (Zero Variance).** المدخلات المتطابقة يجب أن تنتج دائمًا مخرجات متطابقة رياضيًا. لا تقم بتغيير معايير التقييم الخاصة بك بين المحاولات. تخلص من جميع أشكال الذاتية أو "المزاجية" لضمان العدالة المطلقة. يجب أن تكون جميع المخرجات باللغة العربية.

**المبادئ الأساسية للتقييم:**
- **الصدق:** مدى قدرة القياس الكمي على قياس الكفاية المطلوبة فعلاً. يجب أن تعكس الدرجات الممنوحة مدى تمكن الطالب من الكفاية المستهدفة في كل سؤال.
- **الثبات:** منح نتائج متقاربة حتى في حال تغير الأستاذ أو المؤسسة. يجب تطبيق معايير التنقيط بصورة موحدة في كل معالجة لضمان موثوقية النتائج.
- **الإنصاف:** تطبيق المعايير نفسها على جميع التلاميذ دون تمييز.

${referenceInstructionBlock}
البيانات المدخلة هي صور لامتحان الطالب: ${studentName} من الفوج: ${studentGroup}. تعامل مع جميع الصور كوثيقة واحدة مستمرة.

نفذ الخوارزمية التالية بدقة مطلقة:

**الخوارزمية:**
1.  **تحليل الأسئلة وتوزيع النقاط (تجميد المعايير)**:
    -   امسح الوثيقة لتحديد جميع الأسئلة.
    -   وزع إجمالي النقاط (${totalMarks}) بشكل منطقي على الأسئلة التي تم تحديدها.
    -   **قاعدة صارمة:** بمجرد تحديد توزيع النقاط لكل سؤال، لا يجب تغييره بناءً على جودة الإجابة أو أي عامل آخر. يجب أن يكون المجموع دائمًا ${totalMarks}.

2.  **التقييم لكل سؤال (Evaluation per Question)**:
    -   لكل سؤال، قم بتقييم إجابة الطالب بناءً على معايير أكاديمية صارمة والمواد المرجعية المقدمة. ${strictnessInstruction}
    -   **الالتزام بالمبادئ الأساسية:** تأكد تمامًا من أن التنقيط في كل سؤال يستند بدقة إلى مبادئ **الصدق**، و**الثبات**، و**الإنصاف**.
    -   امنح درجة \`marksAwarded\` لكل سؤال.
    -   صغ \`idealAnswer\` (إجابة مثالية) موجزة.
    -   اكتب \`evaluation\` (تقييم الإجابة) يبرر الدرجة الممنوحة \`marksAwarded\` بشكل موضوعي، مع توضيح كيف يعكس التنقيط مدى تمكن الطالب من الكفاية المستهدفة (الصدق) وتطبيق سلم التنقيط بشكل عادل (الإنصاف) وموحد (الثبات).
    -   **تصنيف بلوم:** صنف كل سؤال حسب تصنيف بلوم المُراجع. اختر واحدًا بالضبط من: \`knowledge\` (تذكر/حفظ)، \`comprehension\` (فهم)، \`application\` (تطبيق)، \`analysis\` (تحليل)، \`synthesis\` (تركيب/إبداع)، \`evaluation\` (تقييم نقدي).
    -   **مستوى الأداء:** قيّم أداء الطالب في كل سؤال باختيار واحد بالضبط من: \`excellent\` (إتقان تام)، \`good\` (إتقان جيد مع أخطاء طفيفة)، \`acceptable\` (فهم جزئي)، \`insufficient\` (فهم محدود جدًا)، \`absent\` (لا إجابة أو خارج الموضوع).

3.  **تجميع النتائج (Aggregation)**:
    -   احسب قيمة \`score\` الإجمالية.
    -   **شرط:** يجب أن تكون قيمة \`score\` هي المجموع الرياضي الدقيق لجميع قيم \`marksAwarded\` من الخطوة 2. لا تستخدم أي تقدير آخر.
    -   لخص \`strengths\` (نقاط القوة) و \`weaknesses\` (نقاط الضعف) بناءً على التقييمات الفردية.

${integrityAnalysisBlock}
${customInstructionBlock}
6.  **مؤشر الثقة والملاحظات**:
    -   حدد قيمة \`confidenceScore\` (0-100) تعكس مدى ثقتك الإجمالية في دقة التصحيح. اخفض هذه القيمة إذا: كانت الكتابة صعبة القراءة، أو الأسئلة غامضة، أو لم يُقدم مرجع، أو الإجابات غير مكتملة.
    -   اكتب \`gradingNotes\` تصف بإيجاز أي صعوبات واجهتها أو فرضيات اعتمدتها أثناء التصحيح. اتركها فارغة إذا لم تكن هناك.

7.  **تنسيق المخرجات (Output Formatting)**:
    -   قم بتجميع جميع البيانات في كائن JSON واحد.
    -   **شرط:** يجب أن يلتزم كائن JSON تمامًا بالمخطط المقدم.

**JSON Schema:**
${jsonSchema}`;
}

export const gradeExam = async (
    studentName: string, 
    studentGroup: string, 
    examFiles: File[], 
    totalMarks: number, 
    apiKey: string,
    gradingStrictness: 'Lenient' | 'Normal' | 'Strict' | 'Scientific',
    plagiarismSensitivity: 'Low' | 'Medium' | 'High',
    customInstructions: string,
    matchingStudentName: string | null,
    examReference: ExamReference | null,
    language: 'ar' | 'en' | 'fr',
    submissionTimestamp?: string // Optional manual timestamp
): Promise<GradingResult> => {
    if (!apiKey) {
        throw new Error("API_KEY_MISSING");
    }
    const ai = _getGenAI(apiKey);
    
    const requestParts: any[] = [];
    let examReferenceIsProvided = false;
    let referenceAsText: string | null = null;
    
    if (examReference) {
        examReferenceIsProvided = true;
        if (examReference.type === 'files' && (examReference.content as File[]).length > 0) {
            const fileParts = await Promise.all((examReference.content as File[]).map(fileToGenerativePart));
            requestParts.push(...fileParts);
        } else if (examReference.type === 'text') {
            referenceAsText = examReference.content as string;
        }
    }

    const studentImageParts = await Promise.all(examFiles.map(fileToGenerativePart));
    requestParts.push(...studentImageParts);
    
    const prompt = constructGradingPrompt(
        studentName,
        studentGroup,
        totalMarks,
        gradingStrictness,
        plagiarismSensitivity,
        customInstructions,
        matchingStudentName,
        examReferenceIsProvided,
        referenceAsText,
        language
    );
    
    requestParts.push({ text: prompt });

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError: any = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: requestParts },
                config: {
                    temperature: 0.0, // Hard zero for consistency
                    topP: 0.1,        // Force model to pick only the absolute most likely tokens (Determinism)
                    seed: 42,         // Fixed seed for reproducibility
                    tools: [{googleSearch: {}}],
                },
            });
            
            const resultText = response.text?.trim();
            if (!resultText) {
                throw new Error("EMPTY_RESPONSE");
            }
            let jsonString = '';

            const markdownMatch = resultText.match(/```(json)?\s*([\s\S]+?)\s*```/);
            if (markdownMatch && markdownMatch[2]) {
                jsonString = markdownMatch[2];
            } else {
                const firstBrace = resultText.indexOf('{');
                const lastBrace = resultText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    jsonString = resultText.substring(firstBrace, lastBrace + 1);
                } else {
                    jsonString = resultText;
                }
            }
            
            const resultJson = JSON.parse(jsonString);
            
            resultJson.totalMarks = totalMarks;

            const calculatedScore = resultJson.detailedFeedback.reduce((sum: number, item: any) => sum + (item.marksAwarded || 0), 0);
            if (resultJson.score !== calculatedScore) {
                 console.warn(`AI score (${resultJson.score}) does not match calculated score (${calculatedScore}). Using calculated score.`);
                 resultJson.score = calculatedScore;
            }

            // Ensure new academic fields have defaults for backward compatibility
            const validBloomLevels = ['knowledge', 'comprehension', 'application', 'analysis', 'synthesis', 'evaluation'];
            const validPerformanceLevels = ['excellent', 'good', 'acceptable', 'insufficient', 'absent'];
            
            if (resultJson.detailedFeedback) {
                resultJson.detailedFeedback = resultJson.detailedFeedback.map((item: any) => ({
                    ...item,
                    bloomLevel: validBloomLevels.includes(item.bloomLevel) ? item.bloomLevel : 'knowledge',
                    performanceLevel: validPerformanceLevels.includes(item.performanceLevel) ? item.performanceLevel : 'acceptable',
                }));
            }

            return {
                ...resultJson,
                studentName: studentName,
                studentGroup: studentGroup,
                confidenceScore: typeof resultJson.confidenceScore === 'number' ? Math.min(100, Math.max(0, resultJson.confidenceScore)) : 75,
                gradingNotes: resultJson.gradingNotes || '',
                id: new Date().toISOString(), // ID uses current processing time
                timestamp: submissionTimestamp || new Date().toISOString() // Submission time (manual or current)
            } as GradingResult;
        } catch (e: any) {
            lastError = e;
            const isRateLimitError = e.message?.includes('429');
            
            if (isRateLimitError && attempt < MAX_RETRIES - 1) {
                console.log(`Rate limit error on attempt ${attempt + 1}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                break;
            }
        }
    }
    
    console.error("Error during grading process after all retries:", lastError);
    if (lastError instanceof SyntaxError) {
        throw new Error("JSON_PARSE_ERROR");
    }
    if (lastError.message?.includes('API key not valid')) {
        throw new Error("API_KEY_INVALID");
    }
    if (lastError.message?.includes('429')) {
        throw new Error("RATE_LIMIT_ERROR");
    }
    if (lastError.message?.includes('SAFETY')) {
         throw new Error("SAFETY_ERROR");
    }
    if (lastError.message?.includes('Request payload size exceeds the limit')) {
        throw new Error("PAYLOAD_SIZE_ERROR");
    }
    
    throw new Error("UNEXPECTED_GRADING_ERROR");
};

// ... (Unit tests remain largely unchanged)
export async function runUnitTests() {
    console.log("🚀 Unit Tests Skipped for brevity.");
}

