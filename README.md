# News Nexus URL Scraper

## Overview

This is a Node.js application that scrapes news article URLs from a list of news sources and stores them in a SQLite database.

This will be a TypeScript project. That connects to the NewsNexusDb09 database using the NewsNexusDb09 package. Instructions for connecting to the database are in the docs/DATABASE_OVERVIEW.md file.

## env

```
NAME_DB=newsnexus09.db
PATH_DATABASE=/Users/nick/Documents/_databases/NewsNexus09/
```

## Run

1. `npm run build`
2. `npm start`

## Requirements

We want to make a new micro service called NewsNexusUrlScraper01. This app will connect to the News Nexus database using the NewsNexusDb09 package.

The database has an Articles table and the NewsNexusUrlScraper01 will loop over all the articles. For each article it will use the article.url from the Articles table and scrape the url. It will save the content in the ArticleContents table using the article ID in the ArticleContents.articleId and the content in the ArticleContents.content field.
