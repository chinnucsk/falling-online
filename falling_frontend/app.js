/*global
 window: true
 jquery:true,
 $:true,
 us: true,
 _: true,
 jQuery: true,
 setTimeout: true,
 document: true,
 angular: true,
 WebSocket: true
*/



var us = _.noConflict();

// var myPlayerNumber = 0;


// Creates a placeholder card that animates to the stack
// TODO: encapsulate in card directive
function animateDeal(card, playerNumber, stackNumber, animationDuration, continuation) {
  // Initial card placeholder creation and insertion in the dom
  var animCard = $("<div />", {
    "class": "animated card",
    "text": card.kind
  })
  .css({
    "top": ($(window).height()),
    "left": ($(window).width()/2)
  })
  .css("-webkit-transition-duration", animationDuration + "s");
  $("body").append(animCard);
  // Trigger the animation - send the card to the requested stack
  animCard.css($("#player-" + playerNumber + "-stack-" + stackNumber).offset());
  setTimeout(function () {
    
    animCard.remove();

    if (continuation && us.isFunction(continuation)) {
      continuation(card, playerNumber, stackNumber);
    }
  }, animationDuration * 1000);

}

var FallingGame = new angular.module("falling", []);

// The websocket URI to bind to
FallingGame.value('SOCKET_ADDRESS', "ws://localhost:8080");

// Easy switch for use during dev for fake web socket vs real one
FallingGame.value('USE_FAKE_SOCKET', true);

FallingGame.factory('Socket', function (SOCKET_ADDRESS, USE_FAKE_SOCKET) {
  // TODO: extract out into tests
  var FakeWebSocket = function () {
    var self = {};
    
    var pNum = 0, cardNum = 0;
    
    // default
    
    window.setInterval(function () {
      console.log("Dealing");
      self.onmessage({
        "action": "clear",
        "player": pNum
      });
      self.onmessage({
        "action": "deal",
        "card": {
          "kind": ("test" + (cardNum++))
        },
        "player": pNum, 
        "stack": 0
      });
      
      // rotate players
      pNum = (pNum + 1) % 4; // hardcoded number of players for basic testing
    }, 2000);
    
    return self;
  };
  
  return (USE_FAKE_SOCKET ? new FakeWebSocket() : new WebSocket(SOCKET_ADDRESS));
});

FallingGame.factory('Server', function (Socket, GameState, $rootScope) {

  Socket.onopen = function () {
    console.log("Connected to server");
    Socket.send("data");
  };

  Socket.onmessage = function (message) {
    // console.log(message);
    if (message.action === 'deal') {
      animateDeal(message.card, message.player, message.stack, 0.5, function (card, playerNumber, stackNumber) {
        GameState.dealCard(card, playerNumber, stackNumber);
        $rootScope.$apply();
      });
    }
    else if (message.action === 'clear') {
      GameState.clearRider(message.player);
    }
    
    $rootScope.$apply();
  };

  Socket.onerror = function (err) {
    console.log("ERROR");
    console.log(err);
  };
});

FallingGame.value("myPlayerNumber", 0);

FallingGame.factory('GameState', function (myPlayerNumber) {
  var Game = function () {
    var self = {};

    var players = [];

    // Sets up a new game with the specified number of players
    var newGame = function (playerCount) {
      for (var playerNum = 0; playerNum < playerCount; playerNum++) {
        players.push({
          playerNumber: playerNum,
          hand: null,
          rider: {
            card: null,
            extras: 0
          },
          stacks: [[]]
        });
      }
    };
    self.newGame = newGame;

    /*
     * Public - Retreives all players in the current game
    */
    var getPlayers = function () {
      return players;
    };
    self.getPlayers = getPlayers;

    var getMyHand = function () {
      return players[myPlayerNumber].hand;
    };
    self.getMyHand = getMyHand;

    var pickUpCardFromStack = function (playerNumber, stackNumber) {
      // Only allow pickup from the player's own stacks
      // TODO: move this into the view, since it really should be
      // conditional ng-click binding and not handled here
      if (playerNumber === myPlayerNumber) {
        var stack = players[myPlayerNumber].stacks[stackNumber];
        if (!getMyHand()) {
          setMyHand(stack.pop());
        }
      }
    };
    self.pickUpCardFromStack = pickUpCardFromStack;

    var dealCard = function (card, playerNumber, stackNumber) {
      players[playerNumber].stacks[stackNumber].push(card);
    };
    self.dealCard = dealCard;

    var playCard = function (playerNumber) {
      var rider = players[playerNumber].rider;
      var card = getMyHand();

      if (!rider.card) {
        rider.card = card;
        setMyHand(null);
      } else if (rider.card && card.kind === "extra") {
        rider.extras += 1;
        setMyHand(null);
      }
      // $scope.$apply();
    };
    self.playCard = playCard;

    var getStacks = function (playerNumber) {
      return players[playerNumber].stacks;
    };
    self.getStacks = getStacks;

    /*
     * Public - Adds an empty stack for the given player number
    */
    var addStack = function (playerNumber) {
      players[playerNumber].stacks.push([]);
    };
    self.addStack = addStack;

    var getNumberOfStacks = function (playerNumber) {
      return players[playerNumber].stacks.length;
    };
    self.getNumberOfStacks = getNumberOfStacks;

    var setMyHand = function (card) {
      players[myPlayerNumber].hand = card;
    };
    self.setMyHand = setMyHand;

    var drawCard = function (card) {
      if (!getMyHand()) {
        setMyHand(card);
      }
    };
    self.drawCard = drawCard;

    var getRiderCard = function (playerNumber) {
      return players[playerNumber].rider.card;
    };
    self.getRiderCard = getRiderCard;

    var clearRider = function (playerNumber) {
      var rider = players[playerNumber].rider;
      
      if (rider.card) {
        // Special condition for skip - just remove one extra
        if (rider.card.kind === "skip" && rider.extras) {
          rider.extras -= 1;
        } else {
          rider.card = null;
          rider.extras = 0;
        }        
      }
    };
    self.clearRider = clearRider;
    
    return self;
  };

  return new Game();
});

FallingGame.controller('GameController', function ($scope, GameState, Server) {
  $scope.gameState = GameState;
  
  // Remove - start a new game
  $scope.gameState.newGame(4);
  
  // Test method. TODO: delete
  $scope.testDeal = function (playerNumber, stackNumber) {
    // console.log($scope.gameState)
    if (!$scope.gameState.getNumberOfStacks(playerNumber)) {
      $scope.gameState.addStack(playerNumber);
      $scope.$apply();
    }
    animateDeal({ kind: "hit" }, playerNumber, stackNumber, 0.25, function (card, playerNumber, stackNumber) {
      $scope.gameState.dealCard(card, playerNumber, stackNumber);
      $scope.$apply();
    });
    console.log($scope.gameState.getStacks(playerNumber));
  };
});


FallingGame.directive("hand", function (GameState) {
  return {
    restrict: "A",
    link: function ($scope, element, attributes) {
      $(document).bind('mousemove', function (event) {
        $(element).offset({
          left: (event.pageX - ($(element).width() / 2.0)),
          top: (event.pageY - ($(element).height() / 2.0))
        });
      });
      $(element).bind('mouseup', function (cursor) {
        $(attributes.dropon).each(function (index) {
          var playerNumber = $(this).attr("playerNumber");
          var rider = $(this);

          // hit test - if the player is attempting to play their hand onto this
          if ((cursor.pageX > rider.offset().left && // left edge
              cursor.pageX < rider.offset().left + rider.width()) && // right edge
              (cursor.pageY > rider.offset().top && // top edge
              cursor.pageY < rider.offset().top + rider.height())) { // bottom edge

            // TODO: account for invalidated plays
            GameState.playCard(playerNumber);
            $scope.$apply();
          }
        });
      });
    }
  };
});