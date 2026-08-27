#pragma once

#include "CrewDB.h"

class TmTrainingConfigIndex {
public:
	TmTrainingConfigIndex(const vector<std::shared_ptr<TmTrainingConfig>>& tmTrainingConfigList);

	const vector<std::shared_ptr<TmTrainingConfig>> getByCategory(const string& category) const;

	const vector<std::shared_ptr<TmTrainingConfig>> getByCategory(const string& category, const string& parentCode) const;

	const vector<std::shared_ptr<TmTrainingConfig>> getByCategory(const string& category, const vector<string>& parentCodes) const;

	const set<string> getCodesByCategory(const string& category, const vector<string>& parentCodes) const;

private:
	unordered_multimap<string, std::shared_ptr<TmTrainingConfig>> _categoryIndex; //<category, TmTrainingConfig>

	unordered_map<string, std::shared_ptr<TmTrainingConfig>> _categoryAndCodeIndex; //<category+Code, TmTrainingConfig>

	void makeIndex(const vector<std::shared_ptr<TmTrainingConfig>>& tmTrainingConfigList);

	string makeKey(const string& category, const string& tmCode) const;
};

