#pragma once

#include <vector>
#include <string>
#include "MatchExpression.h"
#include "UtilFunc.h"
#include "utils/StringUtils.h"

template<typename T>
class InExMatchExpression : public MatchExpression<T> {
private:
	//能包含的Item
	std::vector<std::string> _includedItems{};

	//不能包含的Item
	std::vector<std::string> _excludedItems{};

protected:
	bool MatchExcludedItems(const vector<string>& items) const {
		if (items.empty() || _excludedItems.empty()) {
			return true;
		}
		for (auto& item : items) {
			//针对“不能包含的Item”判断，只要有一个包含则结果为false
			if (!MatchExcludedItems(item)) {
				return false;
			}
		}
		return true;
	}

	bool MatchExcludedItems(const string& item) const {
		if (item.empty()) {
			//Item 不能为空
			return false;
		}
		auto iter = std::find(_excludedItems.cbegin(), _excludedItems.cend(), item);
		return iter == _excludedItems.cend();
	}

	bool MatchIncludedItems(const vector<string>& items) const {
		if (_includedItems.empty()) {
			return true;
		}
		for (auto& item : items) {
			//针对“能包含的Item”判断，只要有一个包含则结果为true
			if (MatchIncludedItems(item)) {
				return true;
			}
		}
		return false;
	}
	
	bool MatchIncludedItems(const string& item) const {
		auto iter = std::find(_includedItems.cbegin(), _includedItems.cend(), item);
		return iter != _includedItems.cend();
	}

	virtual bool ParseExpression(const std::string& expression) override {
		if (expression == RuleParamConstant::ALL) {
			return true;
		}

		std::string excludedText = "";
		bool isExcludedText = StringUtils::unwrapExcludedText(expression, excludedText);
		if (isExcludedText) {
			//格式：!(A|B|C)
			split(excludedText, '|', _excludedItems);
		}
		else {
			//格式：A|B|C
			split(expression, '|', _includedItems);
		}
		return true;
	}

	virtual bool MatchImpl(const T& matchable) const override {
		std::vector<std::string> matchableItems = GetMatchableItems(matchable);
		return MatchIncludedItems(matchableItems) && MatchExcludedItems(matchableItems);
	}

	virtual std::vector<std::string> GetMatchableItems(const T& matchable) const = 0;

public:
	InExMatchExpression() : MatchExpression<T>(MatchExpression<T>::MatchType::MATCH_IN_AND_NOT_IN) {

	}

	virtual bool Ignored() const override {
		return _includedItems.empty() && _excludedItems.empty();
	}

};

class SimpleInExMatchExpression : public InExMatchExpression<std::string> {

protected:
	virtual std::vector<std::string> GetMatchableItems(const std::string& matchable) const override {
		std::vector<std::string> result;
		result.emplace_back(matchable);
		return result;		
	}
};

