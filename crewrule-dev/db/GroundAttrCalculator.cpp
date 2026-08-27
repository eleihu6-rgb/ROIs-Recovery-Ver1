#include <iostream>
#include "GroundAttrCalculator.h"
#include "UtilFunc.h"
#include <algorithm>
#include "RuleParams.h"
#include "Utility.h"

using namespace std;

namespace {
	bool isWildcardOrEmpty(const vector<string>& values) {
		return values.empty() || values[0].empty() || values[0] == "*";
	}

	bool containsValue(const vector<string>& values, const string& value) {
		return find(values.begin(), values.end(), value) != values.end();
	}
}


GroundAttributeCalculator::GroundAttributeCalculator(string airline, map<string, DBAirport*>& airportCodeMap, unordered_map<string, unordered_set<string>>& assignmentNameGroupMap,
	map<string, SharedPtr<ASSIGNMENT>>& assignmentNameMap,
	vector<SharedPtr<TAG_CATEGORY>> tagCategoryList,
	map<long long, vector<SharedPtr<TAG_ROSTER_GROUND>>> tagRosterGroundGroupMap, map<long long, vector<SharedPtr<TAG_GROUP>>> tagGroupTableMap,
	map<long long, TAG *> tagGroupMap) {

	this->airline = airline;
	this->airportCodeMap = airportCodeMap;
	this->assignmentNameGroupMap = assignmentNameGroupMap;
	this->assignmentNameMap = assignmentNameMap;

	for (auto& it : tagCategoryList) {
		tagCodeMap[it->code] = it;
		tagIdMap[it->id] = it;
	}

	this->tagRosterGroundGroupMap = tagRosterGroundGroupMap;
	this->tagGroupTableMap = tagGroupTableMap;
	this->tagGroupMap = tagGroupMap;
}

bool GroundAttributeCalculator::isGround(SharedPtr<ROSTER>& roster) {
	return roster != nullptr && roster->pairing == nullptr;
}

string GroundAttributeCalculator::calculateGroundTag(SharedPtr<ROSTER>& roster) {
	if (!isGround(roster)) {
		return "";
	}

	stringstream ss;
	map<long long, bool> tagsFix;
	vector<long long> hasGroupId;

	// 遍历所有标签
	for (auto& it : tagGroupMap) {
		bool fix = false;
		TAG * tag = it.second;
		if (tagIdMap.find(tag->tagCategoryId) != tagIdMap.end()) {
			hasGroupId.push_back(tag->tagCategoryId);
			// Ground没有division/filiale字段，跳过相关检查
		}

		if (tag->groups.size() > 0 || tagGroupTableMap.find(tag->id) != tagGroupTableMap.end()) {
			// group与group之间的条件
			string groupCondition = strToUpper(tag->condition);
			vector<SharedPtr<TAG_GROUP>> groups = tag->groups;
			if (tagGroupTableMap.find(tag->id) != tagGroupTableMap.end()) {
				if (groupCondition == "OR" && fix) {
					tagsFix[tag->tagCategoryId] = true;
					continue;
				}
				fix = appendTableTag(roster, tag->condition, tag->id);
				if (groupCondition == "AND" && !fix) continue;
			}
			else {
				for (auto& group : groups) {
					if (groupCondition == "OR" && fix) {
						tagsFix[tag->tagCategoryId] = true;
						break;
					}
					fix = appendTableTag(roster, group->condition, group->id);
					if (groupCondition == "AND" && !fix) break;
				}
			}
		}
		// 标签如果没有条件，但是有除外
		else if (tagIdMap[tag->tagCategoryId] && tagIdMap[tag->tagCategoryId]->exceptTag != "")
			fix = true;
		if (fix) {
			bool exceptTagFix = true;
			if (tagIdMap[tag->tagCategoryId] && tagIdMap[tag->tagCategoryId]->exceptTag != "") {
				vector<string> excepTags;
				split(tagIdMap[tag->tagCategoryId]->exceptTag, '|', excepTags);

				for (const auto& tag : excepTags) {
					if (tagCodeMap.find(tag) != tagCodeMap.end() && tagsFix.find(tagCodeMap[tag]->id) != tagsFix.end()) {
						exceptTagFix = false;
						break;
					}
				}
			}
			if (exceptTagFix)
				tagsFix[tag->tagCategoryId] = true;
		}
	}
	// 没有条件没有group
	for (const auto& tag : tagIdMap) {
		if (find(hasGroupId.begin(), hasGroupId.end(), tag.second->id) == hasGroupId.end() && tag.second->exceptTag != "") {
			bool exceptTagFix = true;
			vector<string> excepTags;
			split(tag.second->exceptTag, '|', excepTags);

			for (const auto& tag : excepTags) {
				if (tagCodeMap.find(tag) != tagCodeMap.end() && tagsFix.find(tagCodeMap[tag]->id) != tagsFix.end()) {
					exceptTagFix = false;
					break;
				}
			}
			if (exceptTagFix)
				tagsFix[tag.second->id] = true;
		}
	}

	set<long long> delTagCategoryIds;
	map<long long, bool>::iterator fixTagIter;
	for (fixTagIter = tagsFix.begin(); fixTagIter != tagsFix.end(); fixTagIter++) {
		if (tagIdMap[fixTagIter->first] == nullptr || tagIdMap[fixTagIter->first]->exceptTag == "")
			continue;
		else {
			bool exceptTagFix = true;
			vector<string> excepTags;
			split(tagIdMap[fixTagIter->first]->exceptTag, '|', excepTags);

			for (const auto& tag : excepTags) {
				if (tagCodeMap.find(tag) != tagCodeMap.end() && tagsFix.find(tagCodeMap[tag]->id) != tagsFix.end()) {
					exceptTagFix = false;
					break;
				}
			}
			if (!exceptTagFix) {
				delTagCategoryIds.emplace(fixTagIter->first);
			}
		}
	}

	for (auto tagCategoryId : delTagCategoryIds) {
		tagsFix.erase(tagCategoryId);
	}

	map<string, bool> result;
	for (auto& it : tagsFix) {
		if (it.second && tagIdMap[it.first] && tagIdMap[it.first]->code != "") {
			result[tagIdMap[it.first]->code] = true;
		}
	}

	for (auto& it : result) {
		if (it.first != "") {
			// 增加attribute source 筛选
			// 如果为man，则过滤
			if (tagCodeMap[it.first]->source == "man" || tagCodeMap[it.first]->source == "MANUAL") {
				continue;
			}
			ss << (ss.tellp() > 0 ? "|" : "");
			ss << it.first;
		}
	}

	return ss.str();
}

bool GroundAttributeCalculator::appendTableTag(SharedPtr<ROSTER>& roster, string tableCondition, long long groupId) {
	bool fix = false;
	tableCondition = strToUpper(tableCondition);
	if (tagGroupTableMap.find(groupId) != tagGroupTableMap.end()) {
		// table之间的条件
		for (auto& table : tagGroupTableMap[groupId]) {
			if (tableCondition == "OR" && fix) {
				break;
			}
			// table表中条件
			string rowCondition = strToUpper(table->condition);
			if (table->tableType == "ROSTER_GROUND") {
				if (tagRosterGroundGroupMap.find(table->id) == tagRosterGroundGroupMap.end())
					continue;
				fix = appendRosterGroundTag(roster, tagRosterGroundGroupMap[table->id], rowCondition);
			}
			if (tableCondition == "AND" && !fix) {
				break;
			}
		}
	}
	return fix;
}

bool GroundAttributeCalculator::appendRosterGroundTag(SharedPtr<ROSTER>& roster, vector<SharedPtr<TAG_ROSTER_GROUND>> tagRosterGrounds, string condition) {
	bool fix = false;

	for (auto& it : tagRosterGrounds) {
		if (condition == "OR" && fix) {
			return fix;
		}
		fix = false;

		int strDtLow = hhmmStrToHHmmInt(it->strDtLow);
		int strDtHigh = hhmmStrToHHmmInt(it->strDtHigh);
		int endDtLow = hhmmStrToHHmmInt(it->endDtLow);
		int endDtHigh = hhmmStrToHHmmInt(it->endDtHigh);
		int dutyPeriodLow = hhmmStrToMinutes(it->dutyPeriodLow);
		int dutyPeriodHigh = hhmmStrToMinutes(it->dutyPeriodHigh);
		int overlapPeriodLow = hhmmStrToMinutes(it->overlapPeriodLow);
		int overlapPeriodHigh = hhmmStrToMinutes(it->overlapPeriodHigh);

		// Start Time检查 (时间点范围 strDtLow-strDtHigh)
		if (strDtLow != -1 && strDtHigh != -1) {
			int rosterStartHHMM = atoi(utcToUtcHHMM(roster->strLoc).c_str());
			if (rosterStartHHMM < strDtLow || rosterStartHHMM > strDtHigh) {
				continue;
			}
		}

		// End Time检查 (时间点范围 endDtLow-endDtHigh)
		if (endDtLow != -1 && endDtHigh != -1) {
			int rosterEndHHMM = atoi(utcToUtcHHMM(roster->endLoc).c_str());
			if (rosterEndHHMM < endDtLow || rosterEndHHMM > endDtHigh) {
				continue;
			}
		}

		// Location检查 (多选，|分隔)
		if (!isWildcardOrEmpty(it->locations)) {
			if (!containsValue(it->locations, roster->location)) {
				continue;
			}
		}

		// Assignment Group检查 (多选，|分隔)
		if (!isWildcardOrEmpty(it->assignmentGroups)) {
			bool found = false;
			for (const auto& group : it->assignmentGroups) {
				if (isAssignmentInGroup(roster->qualifier, group)) {
					found = true;
					break;
				}
			}
			if (!found)
				continue;
		}

		// Assignment检查 (多选，|分隔)
		if (!isWildcardOrEmpty(it->assignments)) {
			if (!containsValue(it->assignments, roster->qualifier)) {
				continue;
			}
		}

		// Assignment Type检查 (多选，|分隔)
		if (!isWildcardOrEmpty(it->assignmentTypes)) {
			auto assignmentIt = assignmentNameMap.find(roster->qualifier);
			if (assignmentIt == assignmentNameMap.end() || assignmentIt->second == nullptr) {
				continue;
			}
			if (!containsValue(it->assignmentTypes, assignmentIt->second->TYPE)) {
				continue;
			}
		}

		// Is Swap检查 (Y或N)
		if (!it->isSwap.empty() && it->isSwap != "*") {
			string isSwapValue = roster->isSwapped ? "1" : "0";
			if (it->isSwap != isSwapValue) {
				continue;
			}
		}

		// Is Request检查 (Y或N)
		if (!it->isRequest.empty() && it->isRequest != "*") {
			string isRequestValue = roster->isRequested ? "1" : "0";
			if (it->isRequest != isRequestValue) {
				continue;
			}
		}

		// Is Training检查 (Y或N)
		if (!it->isTraining.empty() && it->isTraining != "*") {
			string isTrainingValue = roster->isTraining;
			if (it->isTraining != isTrainingValue) {
				continue;
			}
		}

		// Training Role检查
		if (!it->trainingRole.empty() && it->trainingRole != "*") {
			if (it->trainingRole != roster->tmRole) {
				continue;
			}
		}

		// Duty Period检查 (时间段 dutyPeriodLow-dutyPeriodHigh)
		if (dutyPeriodLow != -1 && dutyPeriodHigh != -1) {
			int rosterDurationMin = static_cast<int>((roster->endLoc - roster->strLoc) / 60);
			if (rosterDurationMin < dutyPeriodLow || rosterDurationMin > dutyPeriodHigh) {
				continue;
			}
		}

		// Overlap Period检查 (时间段 overlapPeriodLow-overlapPeriodHigh)
		// 这里需要检查roster的时间是否与指定的overlap period有重叠
		if (overlapPeriodLow != -1 && overlapPeriodHigh != -1) {
			bool inRange = Utility::GetInstancePtr()->isTimeRangeContained(roster->strLoc, roster->restStrLoc, it->overlapPeriodLow, it->overlapPeriodHigh);
			if (!inRange) {
				continue;
			}
		}

		fix = true;
		if (condition == "AND" && !fix) {
			return fix;
		}
	}
	return fix;
}

void GroundAttributeCalculator::calculateAndSetGroundTag(vector<SharedPtr<ROSTER>>& rosters) {
	for (auto& roster : rosters) {
		if (!isGround(roster)) {
			continue;
		}
		string tag = calculateGroundTag(roster);

		vector<string> originalTagSet;
		vector<string> tagSet;
		split(roster->attribute, '|', tagSet); // 原有的duty字段可能包含一些标签
		tagSet.clear();
		split(roster->attribute, '|', originalTagSet);
		for (auto& originalTag : originalTagSet) {
			if (originalTag == "") {
				continue;
			}
			if (tagCodeMap.find(originalTag) == tagCodeMap.end() || tagCodeMap[originalTag] == nullptr) {
				continue;
			}
			if (strToUpper(tagCodeMap[originalTag]->source) == "RULE") {
				continue;
			}
			tagSet.push_back(originalTag);
		}
		split(tag, '|', tagSet);
		stable_sort(tagSet.begin(), tagSet.end());
		tagSet.erase(unique(tagSet.begin(), tagSet.end()), tagSet.end());

		stringstream ss;
		for (auto& it : tagSet) {
			if (it != "") {
				ss << (ss.tellp() > 0 ? "|" : "");
				ss << it;
			}
		}

		roster->attribute = ss.str();
	}
}
bool GroundAttributeCalculator::isAssignmentInGroup(string assignment, string group) {

	const string group_const = group;
	// auto& itKey = this->assignmentNameGroupMap.find(group_const);
	auto itKey = this->assignmentNameGroupMap.find(group_const);

	if (itKey == this->assignmentNameGroupMap.end())
		return false;

	// auto& itVal = itKey->second.find(assignment);
	auto itVal = itKey->second.find(assignment);

	if (itVal == itKey->second.end()) {
		return false;
	}
	return true;
}