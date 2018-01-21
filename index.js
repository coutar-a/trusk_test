const inquirer = require('inquirer');
const Promise = require('bluebird');
const redis = require('redis');
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

var redisAvailable = false;
var newTruskerForm = {};

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

function formDump () {
  return 'Nom: ' + newTruskerForm['name'] + '\n' +
  'Société: ' + newTruskerForm['company'] + '\n' +
  'Nombre de camions : ' + newTruskerForm['truckCount'] + '\n' +
  'Détail des camions: ' + JSON.stringify(newTruskerForm['trucksDetails']) + '\n' +
  'Nombre d\'employés: ' + newTruskerForm['employeeCount'] + '\n' +
  'Noms des employés: ' + JSON.stringify(newTruskerForm['employeeNames']) + '\n';
}

function generateValidationQuestion () {
  var total = 'Voici les informations que vous nous avez fourni :\n' +
  formDump() + 'Les informations sont-elles valides ?';
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

function finalFormCheck (answers) {
  if (answers) {
    newTruskerForm.trucksDetails = answers;
  }
  inquirer.prompt(generateValidationQuestion()).then(answer => {
    if (answer.infoConfirmation) {
      client.del('form', (res) => {
        console.log('Merci pour votre patience. Vous êtes maintenant enregistrés et nous allons pouvoir commencer !');
        // brutal but efficient
        process.exit(0);
      });
    } else {
      console.log("Désolé de l'entendre ! Nous allons recommencer.");
      newTruskerForm = [];
      client.del('form', (res) => {
        runQuestions(true);
      });
    }
  });
}

function parseEmployeeQuestions (answers) {
  if (answers) {
    newTruskerForm.truckCount = parseFloat(answers.truckCount);
    newTruskerForm.trucksDetails = [];
    delete answers.truckCount;
    newTruskerForm.employeeNames = Object.keys(answers).map(key => answers[key]);
  }
  var truckQuestions = [...Array(newTruskerForm.truckCount).keys()].map(x => generateTruckQuestions(x));
  var askTruckQuestions = Promise.resolve(truckQuestions).map(helper, {concurrency: 1});
  askTruckQuestions.then(finalFormCheck);
}

function parseIntroQuestions (answers) {
  if (answers) {
    newTruskerForm = answers;
  }
  var nameQuestions = [...Array(newTruskerForm.employeeCount).keys()].map(x => generateEmployeeQuestion(x));
  nameQuestions.push({type: 'input', name: 'truckCount', message: 'De combien de camions votre entreprise dispose-t-elle ?', validate: validateNumber});
  inquirer.prompt(nameQuestions).then(parseEmployeeQuestions);
}

function runFirstQuestionSet () {
  inquirer.prompt(questions).then(parseIntroQuestions);
}

function resumeQuestionnaire (redisRes) {
  // none of this is elegant or extensible - maybe redo it with a state machine ?
  newTruskerForm = JSON.parse(redisRes);
  console.log('Nous avons été interrompus. Reprenons là où nous en étions.');
  console.log('Informations récupérées de la session interrompue :\n' + formDump());
  if (newTruskerForm.hasOwnProperty('employeeCount') && (!newTruskerForm.hasOwnProperty('truckCount'))) {
    parseIntroQuestions(null);
  } else if (newTruskerForm.hasOwnProperty('truckCount') && (!newTruskerForm.hasOwnProperty('trucksDetails'))) {
    parseEmployeeQuestions(null);
  } else if (newTruskerForm.hasOwnProperty('truckCount') && (newTruskerForm.hasOwnProperty('trucksDetails'))) {
    finalFormCheck(null);
  } else {
    runFirstQuestionSet();
  }
}

// entry point - using retry_stragegy to handle the case where there is no local redis server available,
// as client.on('error') fires constantly if that is the case
const client = redis.createClient({retry_strategy: (options) => {
  if (options.error && options.error.code === 'ECONNREFUSED') {
    // End reconnecting on a specific error and flush all commands with
    // a individual error
    console.log('no redis');
    redisAvailable = false;
    runQuestions(true);
  }
}});

client.on('connect', () => {
  redisAvailable = true;
  runQuestions(false);
});

function runQuestions (skipRedisCheck) {
  console.log('Bonjour ! Bienvenue chez Trusk. Pour commencer, quelques questions : ');

  if (skipRedisCheck === true || !redisAvailable) {
    runFirstQuestionSet();
  } else {
    try {
      client.getAsync('form').then((res) => {
        if (res === null) {
          runFirstQuestionSet();
        } else {
          resumeQuestionnaire(res);
        }
      });
    } catch (error) {
      redisAvailable = false;
      runFirstQuestionSet();
    }
  }
}

// saving to redis in case of ctrl+c
process.on('SIGINT', function () {
  if (Object.keys(newTruskerForm).length === 0 && newTruskerForm.constructor === Object) {
    process.exit(0);
  } else if (redisAvailable) {
    client.set('form', JSON.stringify(newTruskerForm), (err, res) => {
      if (err) {
        console.log(err);
      }
      process.exit('0');
    });
  }
});
