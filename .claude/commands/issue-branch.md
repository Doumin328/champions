---
allowed-tools: Bash(gh issue create:*), Bash(gh issue develop:*), Bash(git branch --show-current:*)
description: GitHubイシューとフィーチャーブランチを作成する
argument-hint: <issue-title> [description]
---

## Context

- Current branch: !`git branch --show-current`

## Your task

引数: $ARGUMENTS

1つ目の引数をイシュータイトル、2つ目以降の引数（あれば）をイシュー本文として使う。本文が省略された場合は空文字列を使う。

手順:
1. `gh issue create --title "<title>" --body "<description>"` でイシューを作成する
2. 作成されたイシューのURLからイシュー番号を取得する
3. `gh issue develop <issue-number> --checkout` でそのイシューに紐づくブランチを作成してチェックアウトする
4. 作成されたイシューのURLと新しいブランチ名をユーザーに報告する

上記をすべて1回のメッセージで実行すること。他のツールは使わないこと。
