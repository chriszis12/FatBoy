'use strict';

/* ==========================================================================
   Recipe library
   RECIPES holds the numbers (per serving); RECIPE_TEXT holds the words, one
   entry per language. Ids are shared, so saving a recipe survives a language change.
   ========================================================================== */
const RECIPES = [
  { id: 'oats', meal: 'Breakfast', kcal: 320, minutes: 5, protein: 14 },
  { id: 'omelette', meal: 'Breakfast', kcal: 280, minutes: 10, protein: 21 },
  { id: 'bowl', meal: 'Lunch', kcal: 480, minutes: 25, protein: 42 },
  { id: 'lentil', meal: 'Lunch', kcal: 350, minutes: 35, protein: 20 },
  { id: 'salmon', meal: 'Dinner', kcal: 450, minutes: 25, protein: 38 },
  { id: 'stirfry', meal: 'Dinner', kcal: 500, minutes: 20, protein: 40 },
  { id: 'yogurt', meal: 'Snack', kcal: 190, minutes: 3, protein: 15 },
  { id: 'hummus', meal: 'Snack', kcal: 160, minutes: 5, protein: 6 },
];

const RECIPE_TEXT = {
  en: {
    oats: {
      title: 'Overnight oats with berries',
      blurb: 'Made the night before, so breakfast is ready when you are.',
      ingredients: ['50 g rolled oats', '150 ml milk or plant milk', '100 g Greek yogurt', '80 g berries', '1 tsp honey'],
      steps: ['Stir the oats, milk and yogurt together in a jar.', 'Cover and chill for at least 4 hours or overnight.', 'Top with berries and honey before eating.'],
    },
    omelette: {
      title: 'Veggie omelette',
      blurb: 'Quick, filling and easy to change with whatever vegetables you have.',
      ingredients: ['2 eggs', '1 handful spinach', '4 cherry tomatoes, halved', '30 g feta', '1 tsp olive oil', 'Pepper'],
      steps: ['Whisk the eggs with pepper.', 'Warm the oil in a pan and soften the tomatoes and spinach for 2 minutes.', 'Pour in the eggs and cook on medium heat until just set.', 'Add the feta, fold and serve.'],
    },
    bowl: {
      title: 'Chicken and quinoa bowl',
      blurb: 'High in protein, with enough carbs to keep you going through the afternoon.',
      ingredients: ['120 g chicken breast', '60 g dry quinoa', '1 cup mixed leaves', '1/2 cucumber', '1/2 avocado', 'Juice of 1/2 lemon', '1 tsp olive oil'],
      steps: ['Cook the quinoa in twice its volume of water for 12 minutes, then let it steam for 5.', 'Season the chicken and cook it in a hot pan for 5 to 6 minutes a side, then slice.', 'Build the bowl with leaves, cucumber, quinoa, chicken and avocado.', 'Dress with lemon juice and olive oil.'],
    },
    lentil: {
      title: 'Red lentil soup',
      blurb: 'Cheap, warming and good for several days in the fridge.',
      ingredients: ['75 g red lentils', '1 small onion', '1 carrot', '1 garlic clove', '1 tsp cumin', '400 ml vegetable stock', 'Lemon wedge'],
      steps: ['Soften the chopped onion, carrot and garlic in a little oil for 5 minutes.', 'Stir in the cumin, lentils and stock.', 'Simmer for 20 minutes until the lentils fall apart.', 'Blend part of it for a thicker soup and finish with lemon.'],
    },
    salmon: {
      title: 'Baked salmon with greens',
      blurb: 'One tray, little washing up, and plenty of healthy fats.',
      ingredients: ['1 salmon fillet (130 g)', '150 g broccoli', '100 g green beans', '1 tsp olive oil', '1 lemon', 'Salt and pepper'],
      steps: ['Heat the oven to 200 C.', 'Put the salmon and vegetables on a tray, drizzle with oil and season.', 'Bake for 12 to 15 minutes until the fish flakes.', 'Squeeze lemon over everything.'],
    },
    stirfry: {
      title: 'Turkey and vegetable stir-fry',
      blurb: 'A fast weeknight dinner that uses up whatever is in the vegetable drawer.',
      ingredients: ['130 g turkey mince', '1 pepper, sliced', '1 cup broccoli florets', '1 garlic clove', '1 tbsp soy sauce', '60 g dry brown rice'],
      steps: ['Start the rice; it takes about 25 minutes.', 'Brown the turkey in a hot pan for 4 minutes.', 'Add the vegetables and garlic and stir-fry for 5 minutes.', 'Stir in the soy sauce and serve over the rice.'],
    },
    yogurt: {
      title: 'Greek yogurt with walnuts',
      blurb: 'A snack with protein that actually keeps you full.',
      ingredients: ['150 g plain Greek yogurt', '15 g walnuts, chopped', '1 tsp honey', 'Cinnamon'],
      steps: ['Spoon the yogurt into a bowl.', 'Top with the walnuts, honey and a pinch of cinnamon.'],
    },
    hummus: {
      title: 'Hummus and vegetable sticks',
      blurb: 'Crunchy, simple and easy to pack for work.',
      ingredients: ['50 g hummus', '1 carrot', '1/2 cucumber', '1 celery stick'],
      steps: ['Cut the vegetables into sticks.', 'Serve with the hummus for dipping.'],
    },
  },
  el: {
    oats: {
      title: 'Overnight βρώμη με μούρα',
      blurb: 'Την ετοιμάζεις το βράδυ και το πρωινό είναι έτοιμο όποτε θέλεις.',
      ingredients: ['50 γρ. νιφάδες βρώμης', '150 ml γάλα ή φυτικό γάλα', '100 γρ. στραγγιστό γιαούρτι', '80 γρ. μούρα', '1 κ.γ. μέλι'],
      steps: ['Ανακάτεψε τη βρώμη, το γάλα και το γιαούρτι σε ένα βαζάκι.', 'Κάλυψέ το και άφησέ το στο ψυγείο τουλάχιστον 4 ώρες ή όλη νύχτα.', 'Πρόσθεσε τα μούρα και το μέλι πριν φας.'],
    },
    omelette: {
      title: 'Ομελέτα με λαχανικά',
      blurb: 'Γρήγορη, χορταστική και εύκολο να αλλάξει με ό,τι λαχανικά έχεις.',
      ingredients: ['2 αυγά', '1 χούφτα σπανάκι', '4 ντοματίνια, κομμένα στη μέση', '30 γρ. φέτα', '1 κ.γ. ελαιόλαδο', 'Πιπέρι'],
      steps: ['Χτύπησε τα αυγά με πιπέρι.', 'Ζέστανε το λάδι στο τηγάνι και μαλάκωσε τις ντομάτες και το σπανάκι για 2 λεπτά.', 'Ρίξε τα αυγά και μαγείρεψε σε μέτρια φωτιά μέχρι να δέσουν.', 'Πρόσθεσε τη φέτα, δίπλωσε και σέρβιρε.'],
    },
    bowl: {
      title: 'Μπολ με κοτόπουλο και κινόα',
      blurb: 'Πλούσιο σε πρωτεΐνη, με αρκετούς υδατάνθρακες για να αντέξεις το απόγευμα.',
      ingredients: ['120 γρ. στήθος κοτόπουλου', '60 γρ. κινόα (άβραστη)', '1 φλιτζάνι ανάμεικτα φύλλα', '1/2 αγγούρι', '1/2 αβοκάντο', 'Χυμός από 1/2 λεμόνι', '1 κ.γ. ελαιόλαδο'],
      steps: ['Βράσε την κινόα με διπλάσιο νερό για 12 λεπτά και άφησέ την να ατμίσει 5 λεπτά.', 'Καρύκευσε το κοτόπουλο και ψήσ’ το σε καυτό τηγάνι 5 με 6 λεπτά από κάθε πλευρά και κόψ’ το φέτες.', 'Στήσε το μπολ με φύλλα, αγγούρι, κινόα, κοτόπουλο και αβοκάντο.', 'Ράντισε με χυμό λεμονιού και ελαιόλαδο.'],
    },
    lentil: {
      title: 'Φακόσουπα με κόκκινες φακές',
      blurb: 'Φθηνή, ζεστή και κρατάει καλά πολλές μέρες στο ψυγείο.',
      ingredients: ['75 γρ. κόκκινες φακές', '1 μικρό κρεμμύδι', '1 καρότο', '1 σκελίδα σκόρδο', '1 κ.γ. κύμινο', '400 ml ζωμό λαχανικών', 'Λεμόνι'],
      steps: ['Μαλάκωσε το ψιλοκομμένο κρεμμύδι, το καρότο και το σκόρδο με λίγο λάδι για 5 λεπτά.', 'Πρόσθεσε το κύμινο, τις φακές και τον ζωμό.', 'Άφησε να σιγοβράσουν 20 λεπτά μέχρι να διαλυθούν οι φακές.', 'Χτύπησε ένα μέρος για πιο πηχτή σούπα και τέλειωσε με λεμόνι.'],
    },
    salmon: {
      title: 'Σολομός φούρνου με πράσινα λαχανικά',
      blurb: 'Μία λαμαρίνα, λίγα πιάτα και άφθονα καλά λιπαρά.',
      ingredients: ['1 φιλέτο σολομού (130 γρ.)', '150 γρ. μπρόκολο', '100 γρ. φασολάκια', '1 κ.γ. ελαιόλαδο', '1 λεμόνι', 'Αλάτι και πιπέρι'],
      steps: ['Προθέρμανε τον φούρνο στους 200 C.', 'Βάλε τον σολομό και τα λαχανικά σε λαμαρίνα, ράντισε με λάδι και καρύκευσε.', 'Ψήσε 12 με 15 λεπτά μέχρι να ξεφλουδίζει το ψάρι.', 'Στύψε λεμόνι από πάνω.'],
    },
    stirfry: {
      title: 'Σοτέ γαλοπούλας με λαχανικά',
      blurb: 'Γρήγορο βραδινό που χρησιμοποιεί ό,τι λαχανικά έχεις.',
      ingredients: ['130 γρ. κιμάς γαλοπούλας', '1 πιπεριά, σε λωρίδες', '1 φλιτζάνι μπρόκολο', '1 σκελίδα σκόρδο', '1 κ.σ. σόγια', '60 γρ. καστανό ρύζι (άβραστο)'],
      steps: ['Βάλε το ρύζι να βράσει· θέλει περίπου 25 λεπτά.', 'Σοτάρισε τον κιμά σε καυτό τηγάνι για 4 λεπτά.', 'Πρόσθεσε τα λαχανικά και το σκόρδο και ανακάτευε για 5 λεπτά.', 'Ρίξε τη σόγια και σέρβιρε πάνω στο ρύζι.'],
    },
    yogurt: {
      title: 'Στραγγιστό γιαούρτι με καρύδια',
      blurb: 'Σνακ με πρωτεΐνη που πραγματικά χορταίνει.',
      ingredients: ['150 γρ. σκέτο στραγγιστό γιαούρτι', '15 γρ. καρύδια, χοντροκομμένα', '1 κ.γ. μέλι', 'Κανέλα'],
      steps: ['Βάλε το γιαούρτι σε ένα μπολ.', 'Πρόσθεσε τα καρύδια, το μέλι και μια πρέζα κανέλα.'],
    },
    hummus: {
      title: 'Χούμους με λαχανικά',
      blurb: 'Τραγανό, απλό και εύκολο να το πάρεις στη δουλειά.',
      ingredients: ['50 γρ. χούμους', '1 καρότο', '1/2 αγγούρι', '1 κοτσάνι σέλινο'],
      steps: ['Κόψε τα λαχανικά σε στικς.', 'Σέρβιρε με τον χούμους για βούτηγμα.'],
    },
  },
  es: {
    oats: {
      title: 'Avena de la noche anterior con frutos rojos',
      blurb: 'Se prepara la noche antes y el desayuno está listo cuando tú lo estés.',
      ingredients: ['50 g de copos de avena', '150 ml de leche o bebida vegetal', '100 g de yogur griego', '80 g de frutos rojos', '1 cdta. de miel'],
      steps: ['Mezcla la avena, la leche y el yogur en un frasco.', 'Tapa y refrigera al menos 4 horas o toda la noche.', 'Añade los frutos rojos y la miel antes de comer.'],
    },
    omelette: {
      title: 'Tortilla de verduras',
      blurb: 'Rápida, saciante y fácil de adaptar a las verduras que tengas.',
      ingredients: ['2 huevos', '1 puñado de espinacas', '4 tomates cherry, partidos', '30 g de queso feta', '1 cdta. de aceite de oliva', 'Pimienta'],
      steps: ['Bate los huevos con pimienta.', 'Calienta el aceite en una sartén y ablanda los tomates y las espinacas 2 minutos.', 'Añade los huevos y cocina a fuego medio hasta que cuajen.', 'Agrega el feta, dobla y sirve.'],
    },
    bowl: {
      title: 'Bol de pollo y quinoa',
      blurb: 'Alto en proteína y con los hidratos justos para aguantar la tarde.',
      ingredients: ['120 g de pechuga de pollo', '60 g de quinoa (en seco)', '1 taza de hojas variadas', '1/2 pepino', '1/2 aguacate', 'Zumo de 1/2 limón', '1 cdta. de aceite de oliva'],
      steps: ['Cuece la quinoa con el doble de agua 12 minutos y déjala reposar tapada 5 más.', 'Sazona el pollo y dóralo en una sartén caliente 5 a 6 minutos por lado; luego córtalo en lonchas.', 'Monta el bol con hojas, pepino, quinoa, pollo y aguacate.', 'Aliña con zumo de limón y aceite de oliva.'],
    },
    lentil: {
      title: 'Sopa de lentejas rojas',
      blurb: 'Barata, reconfortante y aguanta varios días en la nevera.',
      ingredients: ['75 g de lentejas rojas', '1 cebolla pequeña', '1 zanahoria', '1 diente de ajo', '1 cdta. de comino', '400 ml de caldo de verduras', 'Un gajo de limón'],
      steps: ['Sofríe la cebolla, la zanahoria y el ajo picados con un poco de aceite 5 minutos.', 'Añade el comino, las lentejas y el caldo.', 'Cuece a fuego lento 20 minutos hasta que las lentejas se deshagan.', 'Tritura una parte para espesarla y termina con limón.'],
    },
    salmon: {
      title: 'Salmón al horno con verduras verdes',
      blurb: 'Una bandeja, poco que fregar y muchas grasas saludables.',
      ingredients: ['1 filete de salmón (130 g)', '150 g de brócoli', '100 g de judías verdes', '1 cdta. de aceite de oliva', '1 limón', 'Sal y pimienta'],
      steps: ['Calienta el horno a 200 C.', 'Pon el salmón y las verduras en una bandeja, rocía con aceite y sazona.', 'Hornea de 12 a 15 minutos hasta que el pescado se desmenuce.', 'Exprime limón por encima.'],
    },
    stirfry: {
      title: 'Salteado de pavo y verduras',
      blurb: 'Una cena rápida que aprovecha lo que haya en el cajón de las verduras.',
      ingredients: ['130 g de carne picada de pavo', '1 pimiento en tiras', '1 taza de ramilletes de brócoli', '1 diente de ajo', '1 cda. de salsa de soja', '60 g de arroz integral (en seco)'],
      steps: ['Pon el arroz a cocer; tarda unos 25 minutos.', 'Dora el pavo en una sartén caliente 4 minutos.', 'Añade las verduras y el ajo y saltea 5 minutos.', 'Incorpora la soja y sirve sobre el arroz.'],
    },
    yogurt: {
      title: 'Yogur griego con nueces',
      blurb: 'Un tentempié con proteína que de verdad sacia.',
      ingredients: ['150 g de yogur griego natural', '15 g de nueces picadas', '1 cdta. de miel', 'Canela'],
      steps: ['Pon el yogur en un bol.', 'Añade las nueces, la miel y una pizca de canela.'],
    },
    hummus: {
      title: 'Hummus con palitos de verdura',
      blurb: 'Crujiente, sencillo y fácil de llevar al trabajo.',
      ingredients: ['50 g de hummus', '1 zanahoria', '1/2 pepino', '1 rama de apio'],
      steps: ['Corta las verduras en palitos.', 'Sirve con el hummus para mojar.'],
    },
  },
};

// A recipe in the language being shown. Recipes Claude wrote carry their own text.
const recipeView = recipe => (recipe.ai ? recipe : { ...recipe, ...RECIPE_TEXT[state.settings.language][recipe.id] });
