package main

import (
	"fmt"
	"log"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

func main() {
	bot, err := tgbotapi.NewBotAPI("")
	if err != nil {
		log.Panic(err)
	}

	bot.Debug = true

	log.Printf("Authorized on account %s", bot.Self.UserName)

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60

	updates := bot.GetUpdatesChan(u)

	//watcher
	for update := range updates {

		if update.Message != nil { // If we got a message
			message := update.Message.Text

			//check helathy

			if message == "/ping" {
				msg := tgbotapi.NewMessage(update.Message.Chat.ID, "pong")
				bot.Send(msg)
			}

			if message == "/start" {
				msg := tgbotapi.NewMessage(update.Message.Chat.ID, "Hello! I am a bot. I can help you with your queries. Please type your query.")
				bot.Send(msg)
			}

			if message == "/all" {
				//get all members in the group

				chatConfig := tgbotapi.ChatAdministratorsConfig{
					ChatConfig: tgbotapi.ChatConfig{
						ChatID: update.Message.Chat.ID,
					},
				}
				members, err := bot.GetChatAdministrators(chatConfig)
				if err != nil {
					log.Printf("Error getting chat administrators: %v", err)
					msg := tgbotapi.NewMessage(update.Message.Chat.ID, "Failed to get group members")
					bot.Send(msg)
					continue
				}

				fmt.Printf("Members: %v", members)

				var mentionText string
				for _, member := range members {
					username := member.User.UserName
					name := member.User.FirstName
					if username != "" {
						mentionText += "@" + username + " "
					} else {
						mentionText += "[" + name + "](tg://user?id=" + string(member.User.ID) + ") "
					}
				}

				msg := tgbotapi.NewMessage(update.Message.Chat.ID, "Tagging all members:\n"+mentionText)
				msg.ParseMode = "Markdown"
				bot.Send(msg)

			}

			// log.Printf("[%s] %s", update.Message.From.UserName, update.Message.Text)
			// msg := tgbotapi.NewMessage(update.Message.Chat.ID, update.Message.Text)
			// bot.Send(msg)
		}
	}

}
