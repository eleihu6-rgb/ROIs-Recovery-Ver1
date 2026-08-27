#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "TmTrainingConfigIndex.h"
#include "Log/Logger.h"

//TmTrainingConfigIndex
TmTrainingConfigIndex::TmTrainingConfigIndex(const vector<std::shared_ptr<TmTrainingConfig>>& tmTrainingConfigList) {
	makeIndex(tmTrainingConfigList);
}

const vector<std::shared_ptr<TmTrainingConfig>> TmTrainingConfigIndex::getByCategory(const string& category) const {
	vector<std::shared_ptr<TmTrainingConfig>> list;
	auto pos = _categoryIndex.equal_range(category);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmTrainingConfig>> TmTrainingConfigIndex::getByCategory(const string& category, const string& parentCode) const {
	vector<std::shared_ptr<TmTrainingConfig>> list;

	string key = makeKey(category, parentCode);
	auto iterParent = _categoryAndCodeIndex.find(key);
	if (iterParent == _categoryAndCodeIndex.end()) {
		return list;
	}
	auto& parentTrainingConfig = iterParent->second;

	auto pos = _categoryIndex.equal_range(category);
	while (pos.first != pos.second)
	{
		if (pos.first->second->parentId == parentTrainingConfig->id) {
			list.emplace_back(pos.first->second);
		}
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmTrainingConfig>> TmTrainingConfigIndex::getByCategory(const string& category, const vector<string>& parentCodes) const {
	vector<std::shared_ptr<TmTrainingConfig>> list;
	for (auto& parentCode : parentCodes) {
		auto tmpList = getByCategory(category, parentCode);
		list.insert(list.end(), tmpList.begin(), tmpList.end());
	}
	return list;
}

const set<string> TmTrainingConfigIndex::getCodesByCategory(const string& category, const vector<string>& parentCodes) const {
	set<string> codes;
	auto list = getByCategory(category, parentCodes);
	for (auto& config : list) {
		codes.emplace(config->tmCode);
	}
	return codes;
}

void TmTrainingConfigIndex::makeIndex(const vector<std::shared_ptr<TmTrainingConfig>>& tmTrainingConfigList) {
	_categoryIndex.clear();
	_categoryAndCodeIndex.clear();
	for (auto& tmTrainingConfig : tmTrainingConfigList) {
		if (!tmTrainingConfig->category.empty())
			_categoryIndex.insert(std::make_pair(tmTrainingConfig->category, tmTrainingConfig));

		if (!tmTrainingConfig->category.empty() && !tmTrainingConfig->tmCode.empty()) {
			string key = makeKey(tmTrainingConfig->category, tmTrainingConfig->tmCode);
			_categoryAndCodeIndex.insert(std::make_pair(key, tmTrainingConfig));
		}
	}
}

string TmTrainingConfigIndex::makeKey(const string& category, const string& tmCode) const {
	stringstream ss;
	ss << category << "$";
	ss << tmCode << "$";
	return ss.str();
}