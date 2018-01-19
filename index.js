const inquirer = require('inquirer');
const Promise = require('bluebird');

console.log('Bonjour ! Bienvenue chez Trusk. Pour commencer, quelques questions : ');

var newTruskerForm;

// Input validation functions

var validateString = (value) => value.length > 0 ? true : 'Veuillez recommencer.';

function validateNumber (value) {
  var valid = !isNaN(parseFloat(value));
  return valid || 'Veuillez saisir un chiffre.';
}

var questions = [
  {
    type: 'input',
    name: 'name',
    message: 'Quel est votre nom ?',
    validate: validateString
  },
  {
    type: 'input',
    name: 'company',
    message: 'Quel est le nom de votre société ?',
    validate: validateString
  },
  {
    type: 'input',
    name: 'employeeCount',
    message: 'Combien d\'employé.e.s votre société emploie-t-elle ?',
    validate: validateNumber,
    filter: Number
  }
];

// Question generators

function generateTruckQuestions (nb) {
  return [{
    type: 'input',
    name: 'truckType',
    message: 'De quel type est le camion n°' + (nb + 1) + ' ?',
    validate: validateString
  },
  {
    type: 'input',
    name: 'truckVolume',
    message: 'Quel est son volume en mètres cube ?',
    validate: validateNumber
  }];
}

function generateEmployeeQuestion (nb) {
  return {
    type: 'input',
    name: 'nameEmployee' + nb,
    message: 'Quel est le nom de l\'employé n°' + (nb + 1) + ' ?',
    validate: validateString
  };
}

function generateValidationQuestion () {
  var total = 'Voici les informations que vous nous avez fourni :\n' +
  'Nom: ' + newTruskerForm['name'] + '\n' +
  'Société: ' + newTruskerForm['company'] + '\n' +
  'Nombre de camions : ' + newTruskerForm['truckCount'] + '\n' +
  'Détail des camions: ' + JSON.stringify(newTruskerForm['trucksDetails']) + '\n' +
  'Nombre d\'employés: ' + newTruskerForm['employeeCount'] + '\n' +
  'Noms des employés: ' + JSON.stringify(newTruskerForm['employeeNames']) + '\n' +
  'Les informations sont-elles valides ?';
  return [{
    type: 'confirm',
    name: 'infoConfirmation',
    message: total,
    default: true
  }];
}

function helper (array) {
  return inquirer.prompt(array).then((result) => result);
}

function runQuestions () {
  inquirer.prompt(questions).then(answers => {
    newTruskerForm = answers;
    var nameQuestions = [...Array(answers.employeeCount).keys()].map(x => generateEmployeeQuestion(x));
    nameQuestions.push({type: 'input', name: 'truckCount', message: 'De combien de camions votre entreprise dispose-t-elle ?', validate: validateNumber});
    inquirer.prompt(nameQuestions).then(names => {
      newTruskerForm.truckCount = parseFloat(names.truckCount);
      newTruskerForm.trucksDetails = [];
      delete names.truckCount;
      newTruskerForm.employeeNames = Object.keys(names).map(key => names[key]);
      var truckQuestions = [...Array(answers.truckCount).keys()].map(x => generateTruckQuestions(x));
      var askAllQuestions = Promise.resolve(truckQuestions).map(helper, {concurrency: 1});
      askAllQuestions.then((test) => {
        newTruskerForm.trucksDetails = test;
        inquirer.prompt(generateValidationQuestion()).then(answer => {
          if (answer.infoConfirmation) {
            console.log('Merci pour votre patience. Vous êtes maintenant enregistrés et nous allons pouvoir commencer !');
          } else {
            console.log("Désolé de l'entendre ! Nous allons recommerncer.");
            newTruskerForm = [];
            runQuestions();
          }
        });
      });
    });
  });
}

runQuestions();
