#include <iostream>
#include "PairingAttrCalculator.h"
#include "UtilFunc.h"
#include <algorithm>
#include "RuleParams.h"
#include "Utility.h"
#include "TimezoneUtils.h"
#include "AssignmentHolder.h"

using namespace std;

namespace {
	bool isManualOrInterfaceTagSource(const string& source) {
		const string normalized = strToUpper(source);
		return normalized == "INTERFACE" || normalized == "MANUAL";
	}
}

PairingAttributeCalculator::PairingAttributeCalculator(string airline, vector< SharedPtr<Segment>>& flightList, vector< SharedPtr<Route>>& routeList, map<long long, ATTRIBUTE>& attrIdMap, map<string, DBAirport*>& airportCodeMap, unordered_map<string, unordered_set<string>>& assignmentNameGroupMap, map<string, RANK> rankMap, vector<SharedPtr<TAG_CATEGORY>> tagCategoryList,
	map<long long, vector<SharedPtr<TAG_FLIGHT>>> tagFlightGroupMap, map<long long, vector<SharedPtr<TAG_DUTY>>> tagDutyGroupMap, map<long long, vector<SharedPtr<TAG_PAIRING>>> tagPairingGroupMap, map<long long, vector<SharedPtr<TAG_GROUP>>> tagGroupTableMap,
	map<long long, TAG *> tagGroupMap, map<long long, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>>> tagFlightCompositionGroupMap) {
	stringstream ss; //share allocator, avoid repeat mem alloc

	this->airline = airline;
	
	//flt
	for (auto& f : flightList) {
		fltIdMap[f->getDBId()] = f;
	}

	//route
	for (auto& item : routeList) {
		if (routeFltNumMap.find(item->fltNum) == routeFltNumMap.end())
			routeFltNumMap[item->fltNum] = vector<SharedPtr<Route>>();
		routeFltNumMap[item->fltNum].push_back(item);

		if (routeDepMap.find(item->depArp) == routeDepMap.end())
			routeDepMap[item->depArp] = vector<SharedPtr<Route>>();
		routeDepMap[item->depArp].push_back(item);

		if (routeArvMap.find(item->arvArp) == routeArvMap.end())
			routeArvMap[item->arvArp] = vector<SharedPtr<Route>>();
		routeArvMap[item->arvArp].push_back(item);
	}

	//attr
	this->attrIdMap = attrIdMap;
	for (auto& it : attrIdMap) {
		ATTRIBUTE& attr = it.second;
		if (attrTypeMap.find(attr.type) == attrTypeMap.end())
			attrTypeMap[attr.type] = vector<ATTRIBUTE*>();
		attrTypeMap[attr.type].push_back(&it.second);
		attrCodeMap[attr.code] = attr;
	}

	//airport
	this->airportCodeMap = airportCodeMap;

	this->assignmentNameGroupMap = assignmentNameGroupMap;
	for (auto& it : tagCategoryList) {
		tagCodeMap[it->code] = it;
		tagIdMap[it->id] = it;
	}

	this->tagFlightGroupMap = tagFlightGroupMap;
	this->tagDutyGroupMap = tagDutyGroupMap;
	this->tagPairingGroupMap = tagPairingGroupMap;
	this->tagGroupTableMap = tagGroupTableMap;
	this->tagGroupMap = tagGroupMap;
	this->tagFlightCompositionGroupMap = tagFlightCompositionGroupMap;

	this->rankMap = rankMap;
}


string PairingAttributeCalculator::calculatePairingAttr(Pairing* pg) {
	//return pg->getAttribute();
	/*if (airline == "BR") {
		return pg->getAttribute();
	}*/

	stringstream ss; 
	
	appendPairingDaysAttr(ss, pg);
	appendPairingFatigueAttr(ss, pg); //OP#2224, 从 duty.fatigue汇总疲劳attribute

	vector<map<long long, bool>> AndRouteIdsOfSegs;
	map<long long, bool> OrRouteIds;
	map<string, bool> airportCategorys;

	//if (pg->getDbId() == 27484116) {
	//	cout << "";
	//}

	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* d = pg->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* seg = d->getSegment(j);
			//只针算 FLY
			if (seg->getAssignment() != "FLY") {
				continue;
			}

			appendAirportAttr(airportCategorys, seg);

			map<long long, bool> AndRouteIds;
			appendRouteAttr(ss, AndRouteIds, OrRouteIds, seg);
			AndRouteIdsOfSegs.push_back(AndRouteIds);
		}
	}
	//整体汇总，避免重复出现相同 airport.category/ attribute
	map<string, bool> result; 
	//汇总airport.category
	for (auto& it : airportCategorys) {
		result[it.first] = true;
	}
	//汇总Route, OR
	for (auto& it : OrRouteIds) {
		if ( attrIdMap[it.first].code != "") {
			result[attrIdMap[it.first].code] = true;
		}
	}
	//汇总Route, AND
	if (AndRouteIdsOfSegs.size() > 0) {
		//以第一个seg AND route为基准，对比后续每一 seg AND route，若存在不匹配则从基准中去除(=false)，最终剩余(=true)者为满足 AND规则的 route attr
		map<long long, bool> andRouteIdsOfAllSegs = AndRouteIdsOfSegs[0];
		for (std::size_t i = 1; i < AndRouteIdsOfSegs.size(); i++) {
			map<long long, bool>& item = AndRouteIdsOfSegs[i];
			for (auto& it : andRouteIdsOfAllSegs) {
				if (item.find(it.first) == item.end())
					it.second = false;
			}
		}
		//汇总 AND
		for (auto& it : andRouteIdsOfAllSegs) {
			if (!it.second) {
				continue;
			}
			long long routeId = it.first;
			if (attrIdMap.find(routeId) != attrIdMap.end() && attrIdMap[routeId].code != "") {
				result[attrIdMap[it.first].code] = true;
			}
		}
	}

	for (auto& it : result) {
		if (it.first != "") {
			// 增加attribute source 筛选
			// 如果为man，则过滤
			if (attrCodeMap[it.first].source == "man") {
				continue;
			}
			ss << (ss.tellp() > 0 ? "|" : "");
			ss << it.first;
		}
	}

	///TEST
	//cout << "**DBG pairing[" << pg->getDbId() << " " << pg->getBase() << "]=" << ss.str() << endl;

	return ss.str();
}


string PairingAttributeCalculator::calculatePairingTag(Pairing* pg) {
	stringstream ss;
	map<long long, bool> tagsFix;
	vector<long long> hasGroupId;
	// 遍历所有标签
	for (auto& it : tagGroupMap) {
		bool fix = false;
		TAG * tag = it.second;
		if (tagIdMap.find(tag->tagCategoryId) != tagIdMap.end()) {
			if (!isTagCategoryType(tagIdMap.at(tag->tagCategoryId), "PAIRING")) {
				continue;
			}
			hasGroupId.push_back(tag->tagCategoryId);
			const auto& divisions = tagIdMap.at(tag->tagCategoryId)->divisions;
			if (find(divisions.begin(), divisions.end(), pg->getDivision()) == divisions.end())
				continue;

			const auto& filiales = tagIdMap.at(tag->tagCategoryId)->filiales;
			if (!filiales.empty() && filiales[0] != "*" && find(filiales.begin(), filiales.end(), pg->getFiliale()) == filiales.end())
				continue;
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
				fix = appendTableTag(pg, tag->condition, tag->id);
				if (groupCondition == "AND" && !fix) continue;
			}
			else {
				for (auto& group : groups) {
					if (groupCondition == "OR" && fix) {
						tagsFix[tag->tagCategoryId] = true;
						break;
					}
					fix = appendTableTag(pg, group->condition, group->id);
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

	///TEST
	//cout << "**DBG pairing[" << pg->getDbId() << " " << pg->getBase() << "]=" << ss.str() << endl;

	return ss.str();
}

string PairingAttributeCalculator::calculateDutyTag(Pairing* pg, Duty* duty) {
	if (pg == nullptr || duty == nullptr) {
		return "";
	}

	stringstream ss;
	map<long long, bool> tagsFix;
	vector<long long> hasGroupId;
	for (auto& it : tagGroupMap) {
		bool fix = false;
		TAG* tag = it.second;
		if (tagIdMap.find(tag->tagCategoryId) != tagIdMap.end()) {
			if (!isTagCategoryType(tagIdMap.at(tag->tagCategoryId), "DUTY")) {
				continue;
			}
			hasGroupId.push_back(tag->tagCategoryId);
			const auto& divisions = tagIdMap.at(tag->tagCategoryId)->divisions;
			if (!divisions.empty() && find(divisions.begin(), divisions.end(), pg->getDivision()) == divisions.end()) {
				continue;
			}

			const auto& filiales = tagIdMap.at(tag->tagCategoryId)->filiales;
			if (!filiales.empty() && find(filiales.begin(), filiales.end(), "*") == filiales.end() && find(filiales.begin(), filiales.end(), pg->getFiliale()) == filiales.end()) {
				continue;
			}
		}

		if (tag->groups.size() > 0 || tagGroupTableMap.find(tag->id) != tagGroupTableMap.end()) {
			string groupCondition = strToUpper(tag->condition);
			vector<SharedPtr<TAG_GROUP>> groups = tag->groups;
			if (tagGroupTableMap.find(tag->id) != tagGroupTableMap.end()) {
				if (groupCondition == "OR" && fix) {
					tagsFix[tag->tagCategoryId] = true;
					continue;
				}
				fix = appendTableTag(pg, duty, tag->condition, tag->id);
				if (groupCondition == "AND" && !fix) {
					continue;
				}
			}
			else {
				for (auto& group : groups) {
					if (groupCondition == "OR" && fix) {
						tagsFix[tag->tagCategoryId] = true;
						break;
					}
					fix = appendTableTag(pg, duty, group->condition, group->id);
					if (groupCondition == "AND" && !fix) {
						break;
					}
				}
			}
		}
		else if (tagIdMap[tag->tagCategoryId] && tagIdMap[tag->tagCategoryId]->exceptTag != "") {
			fix = true;
		}

		if (fix) {
			bool exceptTagFix = true;
			if (tagIdMap[tag->tagCategoryId] && tagIdMap[tag->tagCategoryId]->exceptTag != "") {
				vector<string> excepTags;
				split(tagIdMap[tag->tagCategoryId]->exceptTag, '|', excepTags);

				for (const auto& exceptTag : excepTags) {
					if (tagCodeMap.find(exceptTag) != tagCodeMap.end() && tagsFix.find(tagCodeMap[exceptTag]->id) != tagsFix.end()) {
						exceptTagFix = false;
						break;
					}
				}
			}
			if (exceptTagFix) {
				tagsFix[tag->tagCategoryId] = true;
			}
		}
	}

	for (const auto& tag : tagIdMap) {
		if (!isTagCategoryType(tag.second, "DUTY")) {
			continue;
		}
		if (find(hasGroupId.begin(), hasGroupId.end(), tag.second->id) == hasGroupId.end() && tag.second->exceptTag != "") {
			bool exceptTagFix = true;
			vector<string> excepTags;
			split(tag.second->exceptTag, '|', excepTags);

			for (const auto& exceptTag : excepTags) {
				if (tagCodeMap.find(exceptTag) != tagCodeMap.end() && tagsFix.find(tagCodeMap[exceptTag]->id) != tagsFix.end()) {
					exceptTagFix = false;
					break;
				}
			}
			if (exceptTagFix) {
				tagsFix[tag.second->id] = true;
			}
		}
	}

	set<long long> delTagCategoryIds;
	for (auto fixTagIter = tagsFix.begin(); fixTagIter != tagsFix.end(); ++fixTagIter) {
		if (tagIdMap[fixTagIter->first] == nullptr || tagIdMap[fixTagIter->first]->exceptTag == "") {
			continue;
		}

		bool exceptTagFix = true;
		vector<string> excepTags;
		split(tagIdMap[fixTagIter->first]->exceptTag, '|', excepTags);

		for (const auto& exceptTag : excepTags) {
			if (tagCodeMap.find(exceptTag) != tagCodeMap.end() && tagsFix.find(tagCodeMap[exceptTag]->id) != tagsFix.end()) {
				exceptTagFix = false;
				break;
			}
		}
		if (!exceptTagFix) {
			delTagCategoryIds.emplace(fixTagIter->first);
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
			if (tagCodeMap[it.first]->source == "man" || tagCodeMap[it.first]->source == "MANUAL") {
				continue;
			}
			ss << (ss.tellp() > 0 ? "|" : "");
			ss << it.first;
		}
	}

	return ss.str();
}

bool PairingAttributeCalculator::appendTableTag(Pairing* pg, string tableCondition, long long groupId) {
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
			if (table->tableType == "FLIGHT") {
				if (tagFlightGroupMap.find(table->id) == tagFlightGroupMap.end())
					continue;
				fix = appendFlightTag(pg, tagFlightGroupMap[table->id], rowCondition);
			}
			if (table->tableType == "DUTY") {
				if (tagDutyGroupMap.find(table->id) == tagDutyGroupMap.end())
					continue;
				fix = appendDutyTag(pg, tagDutyGroupMap[table->id], rowCondition);
			}
			if (table->tableType == "PAIRING") {
				if (tagPairingGroupMap.find(table->id) == tagPairingGroupMap.end())
					continue;
				fix = appendPairingTag(pg, tagPairingGroupMap[table->id], rowCondition);
			}
			if (table->tableType == "FLIGHT_COMPOSITION") {
				if (tagFlightCompositionGroupMap.find(table->id) == tagFlightCompositionGroupMap.end())
					continue;
				fix = appendFlightCompositionTag(pg, tagFlightCompositionGroupMap[table->id], rowCondition);
			}
			if (tableCondition == "AND" && !fix) {
				break;
			}
		}
	}
	return fix;
}

bool PairingAttributeCalculator::appendTableTag(Pairing* pg, Duty* duty, string tableCondition, long long groupId) {
	bool fix = false;
	tableCondition = strToUpper(tableCondition);
	if (tagGroupTableMap.find(groupId) != tagGroupTableMap.end()) {
		for (auto& table : tagGroupTableMap[groupId]) {
			if (tableCondition == "OR" && fix) {
				break;
			}

			string rowCondition = strToUpper(table->condition);
			if (table->tableType == "FLIGHT") {
				if (tagFlightGroupMap.find(table->id) == tagFlightGroupMap.end()) {
					continue;
				}
				fix = appendFlightTag(duty, tagFlightGroupMap[table->id], rowCondition);
			}
			if (table->tableType == "DUTY") {
				if (tagDutyGroupMap.find(table->id) == tagDutyGroupMap.end()) {
					continue;
				}
				fix = appendDutyTag(pg, duty, tagDutyGroupMap[table->id], rowCondition);
			}
			if (table->tableType == "FLIGHT_COMPOSITION") {
				if (tagFlightCompositionGroupMap.find(table->id) == tagFlightCompositionGroupMap.end()) {
					continue;
				}
				fix = appendFlightCompositionTag(duty, tagFlightCompositionGroupMap[table->id], rowCondition);
			}
			if (tableCondition == "AND" && !fix) {
				break;
			}
		}
	}
	return fix;
}

bool PairingAttributeCalculator::appendFlightCompositionTag(Pairing* pg, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>> tagFlightCompositions, string condition) {
	vector<Segment*> segments = pg->getSegments();
	for (auto& seg : segments) {
		bool segmentFix = condition == "AND";
		for (auto& it : tagFlightCompositions) {
			const auto & comp = seg->getPlanComposition();
			int rankCount = 0;
			for (auto rank : comp) {
				if (rankMap.find(rank.first) == rankMap.end())
					continue;

				const auto& r = rankMap[rank.first];

				if (!it->division.empty() && it->division != "*" && r.division != it->division)
					continue;

				if (!it->actingRank.empty() && it->actingRank[0] != "*" && find(it->actingRank.begin(), it->actingRank.end(), r.rank) == it->actingRank.end())
					continue;

				rankCount += rank.second;
			}
			if (rankCount < it->minValue || rankCount > it->maxValue) {
				if (condition == "AND") {
					segmentFix = false;
					break;
				}
				continue;
			}

			if (condition == "OR") {
				return true;
			}
			segmentFix = true;
		}
		if (condition == "AND" && segmentFix) {
			return true;
		}
	}
	return false;
}

bool PairingAttributeCalculator::appendFlightCompositionTag(Duty* duty, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>> tagFlightCompositions, string condition) {
	if (duty == nullptr) {
		return false;
	}

	for (auto& seg : duty->getSegmentsRead()) {
		bool segmentFix = condition == "AND";
		for (auto& it : tagFlightCompositions) {
			const auto& comp = seg->getPlanComposition();
			int rankCount = 0;
			for (auto rank : comp) {
				if (rankMap.find(rank.first) == rankMap.end()) {
					continue;
				}

				const auto& r = rankMap[rank.first];
				if (!it->division.empty() && it->division != "*" && r.division != it->division) {
					continue;
				}
				if (!it->actingRank.empty() && it->actingRank[0] != "*" && find(it->actingRank.begin(), it->actingRank.end(), r.rank) == it->actingRank.end()) {
					continue;
				}

				rankCount += rank.second;
			}
			if (rankCount < it->minValue || rankCount > it->maxValue) {
				if (condition == "AND") {
					segmentFix = false;
					break;
				}
				continue;
			}

			if (condition == "OR") {
				return true;
			}
			segmentFix = true;
		}
		if (condition == "AND" && segmentFix) {
			return true;
		}
	}
	return false;
}

bool PairingAttributeCalculator::appendFlightTag(Pairing* pg, vector<SharedPtr<TAG_FLIGHT>> tagFlights, string condition) {
	bool fix = false;
	for (auto& duty : pg->getDutyVec()) {
		for (auto& seg : duty->getSegmentsRead()) {
			if (condition == "OR" && fix) {
				return fix;
			}
			fix = false;
			for (auto& it : tagFlights) {


				int stdStart = hhmmStrToHHmmInt(it->stdStart);
				int stdEnd = hhmmStrToHHmmInt(it->stdEnd);
				int staStart = hhmmStrToHHmmInt(it->staStart);
				int staEnd = hhmmStrToHHmmInt(it->staEnd);
				int schBLHStart = hhmmStrToMinutes(it->scheduleBLHStart);
				int schBLHEnd = hhmmStrToMinutes(it->scheduleBLHEnd);
				int actBLHStart = hhmmStrToMinutes(it->actBLHStart);
				int actBLHEnd = hhmmStrToMinutes(it->actBLHEnd);
				time_t fltDate = seg->getDate().empty() ? seg->getStartTime() : utcStrToUtc((char*)seg->getDate().c_str());

				if (it->fltDtStart != -1 && it->fltDtStart > fltDate) {
					continue;
				}
				if (it->fltDtEnd != -1 && it->fltDtEnd + (3600 * 60 - 1) < fltDate) {
					continue;
				}
				if (it->fleet.size() > 0 && it->fleet[0] != "*" && it->fleet[0] != "" && find(it->fleet.begin(), it->fleet.end(), seg->getFleetCD()) == it->fleet.end()) {
					continue;
				}
				if (it->subFleets.size() > 0 && it->subFleets[0] != "*" && it->subFleets[0] != "" && find(it->subFleets.begin(), it->subFleets.end(), seg->getSubFleet()) == it->subFleets.end()) {
					continue;
				}
				if (it->fltNum.size() > 0 && it->fltNum[0] != "*" && it->fltNum[0] != "" && find(it->fltNum.begin(), it->fltNum.end(), seg->getFlightNumber()) == it->fltNum.end()) {
					continue;
				}
				if (!it->depArp.empty() && it->depArp != "*" && it->depArp != seg->getDepStation()) {
					continue;
				}
				if (!it->arvArp.empty() && it->arvArp != "*" && it->arvArp != seg->getArrStation()) {
					continue;
				}
				int startHHMM = atoi(utcToUtcHHMM(seg->getStartTimeLocSch()).c_str());
				if (airline == "SQ")
					startHHMM = atoi(utcToUtcHHMM(seg->getStartTimeUtcSch() + duty->getRefTimeZone() * 60).c_str());
				if (it->stdStart != "*" && stdStart != -1 && startHHMM < stdStart) {
					continue;
				}
				if (it->stdEnd != "*" && stdEnd != -1 && startHHMM > stdEnd) {
					continue;
				}
				int endHHMM = atoi(utcToUtcHHMM(seg->getEndTimeLocSch()).c_str());
				if (airline == "SQ")
					endHHMM = atoi(utcToUtcHHMM(seg->getEndTimeUtcSch() + duty->getRefTimeZone() * 60).c_str());
				if (it->staStart != "*" && staStart != -1 && endHHMM < staStart) {
					continue;
				}
				if (it->staEnd != "*" && staEnd != -1 && endHHMM > staEnd) {
					continue;
				}
				if (it->dir.size() > 0 && it->dir[0] != "*" && it->dir[0] != "" && find(it->dir.begin(), it->dir.end(), seg->getDomIntType()) == it->dir.end()) {
					continue;
				}
				if (it->assignments.size() > 0 && !it->assignments[0].empty() && it->assignments[0] != "*" && find(it->assignments.begin(), it->assignments.end(), seg->getAssignment()) == it->assignments.end()) {
					continue;
				}
				if (!it->country.empty() && it->country != "*") {
					string depCountry = this->airportCodeMap[seg->getDepStation()]->country;
					string arvCountry = this->airportCodeMap[seg->getArrStation()]->country;
					if (it->country != depCountry && it->country != arvCountry)
						continue;
				}
				if (!it->depArpCategory.empty() && it->depArpCategory != "*") {
					string depCategory = this->airportCodeMap[seg->getDepStation()]->category;
					if (it->depArpCategory != depCategory)
						continue;
				}
				if (!it->arvArpCategory.empty() && it->arvArpCategory != "*") {
					string arvCategory = this->airportCodeMap[seg->getArrStation()]->category;
					if (it->arvArpCategory != arvCategory)
						continue;
				}
				if (!it->airportCategory.empty() && it->airportCategory != "*") {
					string arvCategory = this->airportCodeMap[seg->getArrStation()]->category;
					string depCategory = this->airportCodeMap[seg->getDepStation()]->category;
					if (it->airportCategory != arvCategory && it->airportCategory != depCategory)
						continue;
				}
				if (it->scheduleBLHStart != "*" && schBLHStart != -1 && it->scheduleBLHEnd != "*" && schBLHEnd != -1) {
					const auto& planBLH = seg->getEndTimeUtcSch() - seg->getStartTimeUtcSch();
					if (schBLHStart * 60 > planBLH || schBLHEnd * 60 < planBLH)
						continue;
				}
				if (it->actBLHStart != "*" && actBLHStart != -1 && it->actBLHEnd != "*" && actBLHEnd != -1) {
					if (actBLHStart > seg->getBlkMinutes() || actBLHEnd < seg->getBlkMinutes())
						continue;
				}
				if (it->fltType.size() > 0 && it->fltType[0] != "" && it->fltType[0] != "*") {
					if (find(it->fltType.begin(), it->fltType.end(), seg->getFltType()) == it->fltType.end())
						continue;
				}
				fix = true;
				break;
			}
			if (condition == "AND" && !fix) {
				return fix;
			}
		}
	}
	return fix;
}

bool PairingAttributeCalculator::appendFlightTag(Duty* duty, vector<SharedPtr<TAG_FLIGHT>> tagFlights, string condition) {
	if (duty == nullptr) {
		return false;
	}

	bool fix = false;
	for (auto& seg : duty->getSegmentsRead()) {
		if (condition == "OR" && fix) {
			return fix;
		}
		fix = false;
		for (auto& it : tagFlights) {
			int stdStart = hhmmStrToHHmmInt(it->stdStart);
			int stdEnd = hhmmStrToHHmmInt(it->stdEnd);
			int staStart = hhmmStrToHHmmInt(it->staStart);
			int staEnd = hhmmStrToHHmmInt(it->staEnd);
			int schBLHStart = hhmmStrToMinutes(it->scheduleBLHStart);
			int schBLHEnd = hhmmStrToMinutes(it->scheduleBLHEnd);
			int actBLHStart = hhmmStrToMinutes(it->actBLHStart);
			int actBLHEnd = hhmmStrToMinutes(it->actBLHEnd);
			time_t fltDate = seg->getDate().empty() ? seg->getStartTime() : utcStrToUtc((char*)seg->getDate().c_str());

			if (it->fltDtStart != -1 && it->fltDtStart > fltDate) {
				continue;
			}
			if (it->fltDtEnd != -1 && it->fltDtEnd + (3600 * 60 - 1) < fltDate) {
				continue;
			}
			if (it->fleet.size() > 0 && it->fleet[0] != "*" && it->fleet[0] != "" && find(it->fleet.begin(), it->fleet.end(), seg->getFleetCD()) == it->fleet.end()) {
				continue;
			}
			if (it->subFleets.size() > 0 && it->subFleets[0] != "*" && it->subFleets[0] != "" && find(it->subFleets.begin(), it->subFleets.end(), seg->getSubFleet()) == it->subFleets.end()) {
				continue;
			}
			if (it->fltNum.size() > 0 && it->fltNum[0] != "*" && it->fltNum[0] != "" && find(it->fltNum.begin(), it->fltNum.end(), seg->getFlightNumber()) == it->fltNum.end()) {
				continue;
			}
			if (!it->depArp.empty() && it->depArp != "*" && it->depArp != seg->getDepStation()) {
				continue;
			}
			if (!it->arvArp.empty() && it->arvArp != "*" && it->arvArp != seg->getArrStation()) {
				continue;
			}

			int startHHMM = atoi(utcToUtcHHMM(seg->getStartTimeLocSch()).c_str());
			if (airline == "SQ") {
				startHHMM = atoi(utcToUtcHHMM(seg->getStartTimeUtcSch() + duty->getRefTimeZone() * 60).c_str());
			}
			if (it->stdStart != "*" && stdStart != -1 && startHHMM < stdStart) {
				continue;
			}
			if (it->stdEnd != "*" && stdEnd != -1 && startHHMM > stdEnd) {
				continue;
			}

			int endHHMM = atoi(utcToUtcHHMM(seg->getEndTimeLocSch()).c_str());
			if (airline == "SQ") {
				endHHMM = atoi(utcToUtcHHMM(seg->getEndTimeUtcSch() + duty->getRefTimeZone() * 60).c_str());
			}
			if (it->staStart != "*" && staStart != -1 && endHHMM < staStart) {
				continue;
			}
			if (it->staEnd != "*" && staEnd != -1 && endHHMM > staEnd) {
				continue;
			}
			if (it->dir.size() > 0 && it->dir[0] != "*" && it->dir[0] != "" && find(it->dir.begin(), it->dir.end(), seg->getDomIntType()) == it->dir.end()) {
				continue;
			}
			if (it->assignments.size() > 0 && !it->assignments[0].empty() && it->assignments[0] != "*" && find(it->assignments.begin(), it->assignments.end(), seg->getAssignment()) == it->assignments.end()) {
				continue;
			}
			if (!it->country.empty() && it->country != "*") {
				string depCountry = this->airportCodeMap[seg->getDepStation()]->country;
				string arvCountry = this->airportCodeMap[seg->getArrStation()]->country;
				if (it->country != depCountry && it->country != arvCountry) {
					continue;
				}
			}
			if (!it->depArpCategory.empty() && it->depArpCategory != "*") {
				string depCategory = this->airportCodeMap[seg->getDepStation()]->category;
				if (it->depArpCategory != depCategory) {
					continue;
				}
			}
			if (!it->arvArpCategory.empty() && it->arvArpCategory != "*") {
				string arvCategory = this->airportCodeMap[seg->getArrStation()]->category;
				if (it->arvArpCategory != arvCategory) {
					continue;
				}
			}
			if (!it->airportCategory.empty() && it->airportCategory != "*") {
				string arvCategory = this->airportCodeMap[seg->getArrStation()]->category;
				string depCategory = this->airportCodeMap[seg->getDepStation()]->category;
				if (it->airportCategory != arvCategory && it->airportCategory != depCategory) {
					continue;
				}
			}
			if (it->scheduleBLHStart != "*" && schBLHStart != -1 && it->scheduleBLHEnd != "*" && schBLHEnd != -1) {
				const auto& planBLH = seg->getEndTimeUtcSch() - seg->getStartTimeUtcSch();
				if (schBLHStart * 60 > planBLH || schBLHEnd * 60 < planBLH) {
					continue;
				}
			}
			if (it->actBLHStart != "*" && actBLHStart != -1 && it->actBLHEnd != "*" && actBLHEnd != -1) {
				if (actBLHStart > seg->getBlkMinutes() || actBLHEnd < seg->getBlkMinutes()) {
					continue;
				}
			}
			if (it->fltType.size() > 0 && it->fltType[0] != "" && it->fltType[0] != "*") {
				if (find(it->fltType.begin(), it->fltType.end(), seg->getFltType()) == it->fltType.end()) {
					continue;
				}
			}
			fix = true;
			break;
		}
		if (condition == "AND" && !fix) {
			return fix;
		}
	}
	return fix;
}
bool PairingAttributeCalculator::appendDutyTag(Pairing* pg, vector<SharedPtr<TAG_DUTY>> tagDutys, string condition) {
	vector<Duty *> dutys = pg->getDutyVec();
	bool fix = false;
	for (auto& it : tagDutys) {
		if (condition == "OR" && fix) {
			return fix;
		}

		int transitStart = hhmmStrToMinutes(it->transitDurationStart);
		int transitEnd = hhmmStrToMinutes(it->transitDurationEnd);
		vector<string> transitAirports;
		split(it->transitAirports, '|', transitAirports);
		fix = false;
		for (auto & duty : dutys) {
			int blhStart = hhmmStrToMinutes(it->blhStart);
			int blhEnd = hhmmStrToMinutes(it->blhEnd);
			int fdpStart = hhmmStrToMinutes(it->fdpStart);
			int fdpEnd = hhmmStrToMinutes(it->fdpEnd);
			int dpStart = hhmmStrToMinutes(it->dpStart);
			int dpEnd = hhmmStrToMinutes(it->dpEnd);
			int overlapPeriodStart = hhmmStrToMinutes(it->overlapPeriodStart);
			int overlapPeriodEnd = hhmmStrToMinutes(it->overlapPeriodEnd);
			int checkInStart = hhmmStrToHHmmInt(it->checkInStart);
			int checkInEnd = hhmmStrToHHmmInt(it->checkInEnd);
			int checkOutStart = hhmmStrToHHmmInt(it->checkOutStart);
			int checkOutEnd = hhmmStrToHHmmInt(it->checkOutEnd);
			int dutyDurationStart = hhmmStrToMinutes(it->dutyDurationStart);
			int dutyDurationEnd = hhmmStrToMinutes(it->dutyDurationEnd);
			int firstSegmentDepTimeStart = hhmmStrToMinutes(it->firstSegmentDepTimeStart);
			int firstSegmentDepTimeEnd = hhmmStrToMinutes(it->firstSegmentDepTimeEnd);
			int fdpTouchStart = hhmmStrToMinutes(it->fdpTouchTimeStart);
			int fdpTouchEnd = hhmmStrToMinutes(it->fdpTouchTimeEnd);
			int dutySeq = strToInt(it->dutySeq, 0);
			int firstFlySegmentDepTimeStart = hhmmStrToMinutes(it->firstFlySegDepStart);
			int firstFlySegmentDepTimeEnd = hhmmStrToMinutes(it->firstFlySegDepEnd);
			int lastSegmentArvTimeStart = hhmmStrToMinutes(it->lastSegArvStart);
			int lastSegmentArvTimeEnd = hhmmStrToMinutes(it->lastSegArvEnd);
			int lastFlySegmentArvTimeStart = hhmmStrToMinutes(it->lastFlySegArvStart);
			int lastFlySegmentArvTimeEnd = hhmmStrToMinutes(it->lastFlySegArvEnd);


			shared_ptr<PairingDutyNode> brief = duty->getFirstBreif();
			shared_ptr<PairingDutyNode> debrief = duty->getLastDebrief();
			int dutyDuration = static_cast<int>(debrief->getEndTimeUtcAct() - brief->getStartTimeUtcAct());
			if (checkInStart != -1 && atoi(utcToUtcHHMM(brief->getStartTimeLocSch()).c_str()) < checkInStart) {
				continue;
			}
			if (checkInEnd != -1 && atoi(utcToUtcHHMM(brief->getStartTimeLocSch()).c_str()) > checkInEnd) {
				continue;
			}
			if (checkOutStart != -1 && atoi(utcToUtcHHMM(debrief->getEndTimeLocSch()).c_str()) < checkOutStart) {
				continue;
			}
			if (checkOutEnd != -1 && atoi(utcToUtcHHMM(debrief->getEndTimeLocSch()).c_str()) > checkOutEnd) {
				continue;
			}
			if (blhStart != -1 && duty->getBLKInMins() < blhStart) {
				continue;
			}
			if (blhEnd != -1 && duty->getBLKInMins() > blhEnd) {
				continue;
			}
			if (fdpStart != -1 && duty->getFDPInSecs() < fdpStart * 60) {
				continue;
			}
			if (fdpEnd != -1 && duty->getFDPInSecs() > fdpEnd * 60) {
				continue;
			}
			if (dpStart != -1 && duty->getDPInSecs() < dpStart * 60) {
				continue;
			}
			if (dpEnd != -1 && duty->getDPInSecs() > dpEnd * 60) {
				continue;
			}
			if (dutyDurationStart != -1 && dutyDuration < dutyDurationStart * 60) {
				continue;
			}
			if (dutyDurationEnd != -1 && dutyDuration > dutyDurationEnd * 60) {
				continue;
			}
			if (dutySeq != 0) {
				if ((dutySeq > 0 && duty->getDutySeq() != dutySeq) || (dutySeq < 0 && duty->getDutySeq() != dutys.size() + dutySeq)) {
					continue;
				}
			}
			if (it->segNum != "*") {
				vector<int> segNums;
				split(it->segNum.c_str(), '-', segNums);
				if ((int)segNums.size() == 2 && ((int)duty->getNumSegments() < segNums[0] || (int)duty->getNumSegments() > segNums[1])) {
					continue;
				}
				if ((int)segNums.size() == 1 && (int)duty->getNumSegments() != segNums[0]) {
					continue;
				}
			}
			if (firstSegmentDepTimeStart != -1 && firstSegmentDepTimeEnd != -1) {

				bool InRange = true;
				if (this->airline == "SQ") {
					const auto & offset = duty->getRefTimeZone();
					InRange = Utility::GetInstancePtr()->IsTimesInRange(duty->getFirstSegment()->getStartTimeUtcAct(), offset, it->firstSegmentDepTimeStart, it->firstSegmentDepTimeEnd);
				}
				else {
					InRange = Utility::GetInstancePtr()->IsTimesInRange(duty->getFirstSegment()->getStartTimeLocAct(), 0, it->firstSegmentDepTimeStart, it->firstSegmentDepTimeEnd);
				}
				if (!InRange)
					continue;
			}

			if (firstFlySegmentDepTimeStart != -1 && firstFlySegmentDepTimeEnd != -1) {
				const auto& segment = duty->getFirstFlySegment();
				if (segment) {
					bool InRange = true;
					if (this->airline == "SQ") {
						InRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getStartTimeUtcAct(), duty->getRefTimeZone(), it->firstFlySegDepStart, it->firstFlySegDepEnd);
					}
					else {
						InRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getStartTimeLocAct(), 0, it->firstFlySegDepStart, it->firstFlySegDepEnd);
					}
					if (!InRange)
						continue;
				}
			}

			if (lastSegmentArvTimeStart != -1 && lastSegmentArvTimeEnd != -1) {
				const auto& segment = duty->getLastSegment();
				if (segment) {
					bool InRange = true;
					if (this->airline == "SQ")
						InRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeUtcAct(), duty->getRefTimeZone(), it->lastSegArvStart, it->lastSegArvEnd);
					else
						InRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeLocAct(), 0, it->lastSegArvStart, it->lastSegArvEnd);
					if (!InRange)
						continue;
				}
			}

			if (lastFlySegmentArvTimeStart != -1 && lastFlySegmentArvTimeEnd != -1) {
				const auto& segment = duty->getLastFlySegment();
				if (segment) {
					bool InRange = true;
					if (this->airline == "SQ")
						InRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeUtcAct(), duty->getRefTimeZone(), it->lastFlySegArvStart, it->lastFlySegArvEnd);
					else
						InRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeLocAct(), 0, it->lastFlySegArvStart, it->lastFlySegArvEnd);
					if (!InRange)
						continue;
				}
			}

			if (fdpTouchStart != -1 && fdpTouchEnd != -1) {
				const auto & fdpStartUtc = getFDPStartUtcTimes(duty);
				const auto & fdpEndUtc = getFDPEndUtcTimes(duty);
				const auto & fdpStartLoc = TimezoneUtils::GetLocalTime(fdpStartUtc, this->airportCodeMap[duty->getDepartureStation()]->zoneId);
				const auto& fdpEndLoc = TimezoneUtils::GetLocalTime(fdpEndUtc, this->airportCodeMap[duty->getArrivalStation()]->zoneId);
				if (!Utility::GetInstancePtr()->isTimesCoveredInRange(fdpStartLoc, fdpEndLoc, 0, fdpTouchStart, fdpTouchEnd))
					continue;
			}
			int transitDuration = 0;
			auto segments = duty->getSegments();
			for (int i = 0; i < (int)segments.size() - 1; i++) {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(segments[i], segments[i + 1]);
				if (longTransit) {
					if (transitAirports.size() > 0 && transitAirports[0] != "*" && find(transitAirports.begin(), transitAirports.end(), segments[i]->getArrStation()) == transitAirports.end()) {
						break;
					}
				}

			}
			transitDuration += RuleParams::GetInstancePtr()->getLongTransitRest(segments);
			if (transitStart != -1 && transitDuration < transitStart)
				continue;
			if (transitEnd != -1 && transitDuration > transitEnd)
				continue;

			if (overlapPeriodStart != -1 && overlapPeriodEnd != -1) {
				const auto& dutyStart = duty->getFirstPickup()->getStartTimeLocAct();
				const auto& dutyEnd = duty->getLastDropoff()->getEndTimeLocAct();
				if (!Utility::GetInstancePtr()->isTimesCoveredInRange(dutyStart, dutyEnd, 0, overlapPeriodStart, overlapPeriodEnd))
					continue;
			}

			const auto& dutyStartDay = duty->getStartTimeLocAct() / (3600 * 24);
			const auto& dutyEndDay = duty->getEndTimeLocAct() / (3600 * 24);
			const auto& days = dutyEndDay - dutyStartDay + 1;
			if ((it->dutyDaysStart > 0 && it->dutyDaysEnd > 0) && (days < it->dutyDaysStart || days > it->dutyDaysEnd)) {
				continue;
			}
			fix = true;
			break;
		}
		if (condition == "AND" && !fix) {
			return fix;
		}
	}
	return fix;
}

bool PairingAttributeCalculator::appendDutyTag(Pairing* pg, Duty* duty, vector<SharedPtr<TAG_DUTY>> tagDutys, string condition) {
	if (pg == nullptr || duty == nullptr) {
		return false;
	}

	vector<Duty*> dutys = pg->getDutyVec();
	bool fix = false;
	for (auto& it : tagDutys) {
		if (condition == "OR" && fix) {
			return fix;
		}

		int transitStart = hhmmStrToMinutes(it->transitDurationStart);
		int transitEnd = hhmmStrToMinutes(it->transitDurationEnd);
		vector<string> transitAirports;
		split(it->transitAirports, '|', transitAirports);
		fix = false;

		int blhStart = hhmmStrToMinutes(it->blhStart);
		int blhEnd = hhmmStrToMinutes(it->blhEnd);
		int fdpStart = hhmmStrToMinutes(it->fdpStart);
		int fdpEnd = hhmmStrToMinutes(it->fdpEnd);
		int dpStart = hhmmStrToMinutes(it->dpStart);
		int dpEnd = hhmmStrToMinutes(it->dpEnd);
		int overlapPeriodStart = hhmmStrToMinutes(it->overlapPeriodStart);
		int overlapPeriodEnd = hhmmStrToMinutes(it->overlapPeriodEnd);
		int checkInStart = hhmmStrToHHmmInt(it->checkInStart);
		int checkInEnd = hhmmStrToHHmmInt(it->checkInEnd);
		int checkOutStart = hhmmStrToHHmmInt(it->checkOutStart);
		int checkOutEnd = hhmmStrToHHmmInt(it->checkOutEnd);
		int dutyDurationStart = hhmmStrToMinutes(it->dutyDurationStart);
		int dutyDurationEnd = hhmmStrToMinutes(it->dutyDurationEnd);
		int firstSegmentDepTimeStart = hhmmStrToMinutes(it->firstSegmentDepTimeStart);
		int firstSegmentDepTimeEnd = hhmmStrToMinutes(it->firstSegmentDepTimeEnd);
		int fdpTouchStart = hhmmStrToMinutes(it->fdpTouchTimeStart);
		int fdpTouchEnd = hhmmStrToMinutes(it->fdpTouchTimeEnd);
		int dutySeq = strToInt(it->dutySeq, 0);
		int firstFlySegmentDepTimeStart = hhmmStrToMinutes(it->firstFlySegDepStart);
		int firstFlySegmentDepTimeEnd = hhmmStrToMinutes(it->firstFlySegDepEnd);
		int lastSegmentArvTimeStart = hhmmStrToMinutes(it->lastSegArvStart);
		int lastSegmentArvTimeEnd = hhmmStrToMinutes(it->lastSegArvEnd);
		int lastFlySegmentArvTimeStart = hhmmStrToMinutes(it->lastFlySegArvStart);
		int lastFlySegmentArvTimeEnd = hhmmStrToMinutes(it->lastFlySegArvEnd);

		shared_ptr<PairingDutyNode> brief = duty->getFirstBreif();
		shared_ptr<PairingDutyNode> debrief = duty->getLastDebrief();
		int dutyDuration = static_cast<int>(debrief->getEndTimeUtcAct() - brief->getStartTimeUtcAct());
		if (checkInStart != -1 && atoi(utcToUtcHHMM(brief->getStartTimeLocSch()).c_str()) < checkInStart) {
			continue;
		}
		if (checkInEnd != -1 && atoi(utcToUtcHHMM(brief->getStartTimeLocSch()).c_str()) > checkInEnd) {
			continue;
		}
		if (checkOutStart != -1 && atoi(utcToUtcHHMM(debrief->getEndTimeLocSch()).c_str()) < checkOutStart) {
			continue;
		}
		if (checkOutEnd != -1 && atoi(utcToUtcHHMM(debrief->getEndTimeLocSch()).c_str()) > checkOutEnd) {
			continue;
		}
		if (blhStart != -1 && duty->getBLKInMins() < blhStart) {
			continue;
		}
		if (blhEnd != -1 && duty->getBLKInMins() > blhEnd) {
			continue;
		}
		if (fdpStart != -1 && duty->getFDPInSecs() < fdpStart * 60) {
			continue;
		}
		if (fdpEnd != -1 && duty->getFDPInSecs() > fdpEnd * 60) {
			continue;
		}
		if (dpStart != -1 && duty->getDPInSecs() < dpStart * 60) {
			continue;
		}
		if (dpEnd != -1 && duty->getDPInSecs() > dpEnd * 60) {
			continue;
		}
		if (dutyDurationStart != -1 && dutyDuration < dutyDurationStart * 60) {
			continue;
		}
		if (dutyDurationEnd != -1 && dutyDuration > dutyDurationEnd * 60) {
			continue;
		}
		if (dutySeq != 0) {
			if ((dutySeq > 0 && duty->getDutySeq() != dutySeq) || (dutySeq < 0 && duty->getDutySeq() != static_cast<int>(dutys.size()) + dutySeq)) {
				continue;
			}
		}
		if (it->segNum != "*") {
			vector<int> segNums;
			split(it->segNum.c_str(), '-', segNums);
			if ((int)segNums.size() == 2 && ((int)duty->getNumSegments() < segNums[0] || (int)duty->getNumSegments() > segNums[1])) {
				continue;
			}
			if ((int)segNums.size() == 1 && (int)duty->getNumSegments() != segNums[0]) {
				continue;
			}
		}
		if (firstSegmentDepTimeStart != -1 && firstSegmentDepTimeEnd != -1) {
			bool inRange = true;
			if (this->airline == "SQ") {
				const auto& offset = duty->getRefTimeZone();
				inRange = Utility::GetInstancePtr()->IsTimesInRange(duty->getFirstSegment()->getStartTimeUtcAct(), offset, it->firstSegmentDepTimeStart, it->firstSegmentDepTimeEnd);
			}
			else {
				inRange = Utility::GetInstancePtr()->IsTimesInRange(duty->getFirstSegment()->getStartTimeLocAct(), 0, it->firstSegmentDepTimeStart, it->firstSegmentDepTimeEnd);
			}
			if (!inRange) {
				continue;
			}
		}
		if (firstFlySegmentDepTimeStart != -1 && firstFlySegmentDepTimeEnd != -1) {
			const auto& segment = duty->getFirstFlySegment();
			if (segment) {
				bool inRange = true;
				if (this->airline == "SQ") {
					inRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getStartTimeUtcAct(), duty->getRefTimeZone(), it->firstFlySegDepStart, it->firstFlySegDepEnd);
				}
				else {
					inRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getStartTimeLocAct(), 0, it->firstFlySegDepStart, it->firstFlySegDepEnd);
				}
				if (!inRange) {
					continue;
				}
			}
		}
		if (lastSegmentArvTimeStart != -1 && lastSegmentArvTimeEnd != -1) {
			const auto& segment = duty->getLastSegment();
			if (segment) {
				bool inRange = true;
				if (this->airline == "SQ") {
					inRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeUtcAct(), duty->getRefTimeZone(), it->lastSegArvStart, it->lastSegArvEnd);
				}
				else {
					inRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeLocAct(), 0, it->lastSegArvStart, it->lastSegArvEnd);
				}
				if (!inRange) {
					continue;
				}
			}
		}
		if (lastFlySegmentArvTimeStart != -1 && lastFlySegmentArvTimeEnd != -1) {
			const auto& segment = duty->getLastFlySegment();
			if (segment) {
				bool inRange = true;
				if (this->airline == "SQ") {
					inRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeUtcAct(), duty->getRefTimeZone(), it->lastFlySegArvStart, it->lastFlySegArvEnd);
				}
				else {
					inRange = Utility::GetInstancePtr()->IsTimesInRange(segment->getEndTimeLocAct(), 0, it->lastFlySegArvStart, it->lastFlySegArvEnd);
				}
				if (!inRange) {
					continue;
				}
			}
		}
		if (fdpTouchStart != -1 && fdpTouchEnd != -1) {
			const auto& fdpStartUtc = getFDPStartUtcTimes(duty);
			const auto& fdpEndUtc = getFDPEndUtcTimes(duty);
			const auto& fdpStartLoc = TimezoneUtils::GetLocalTime(fdpStartUtc, this->airportCodeMap[duty->getDepartureStation()]->zoneId);
			const auto& fdpEndLoc = TimezoneUtils::GetLocalTime(fdpEndUtc, this->airportCodeMap[duty->getArrivalStation()]->zoneId);
			if (!Utility::GetInstancePtr()->isTimesCoveredInRange(fdpStartLoc, fdpEndLoc, 0, fdpTouchStart, fdpTouchEnd)) {
				continue;
			}
		}

		int transitDuration = 0;
		auto segments = duty->getSegments();
		for (int i = 0; i < (int)segments.size() - 1; i++) {
			long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(segments[i], segments[i + 1]);
			if (longTransit) {
				if (transitAirports.size() > 0 && transitAirports[0] != "*" && find(transitAirports.begin(), transitAirports.end(), segments[i]->getArrStation()) == transitAirports.end()) {
					break;
				}
			}
		}
		transitDuration += RuleParams::GetInstancePtr()->getLongTransitRest(segments);
		if (transitStart != -1 && transitDuration < transitStart) {
			continue;
		}
		if (transitEnd != -1 && transitDuration > transitEnd) {
			continue;
		}
		if (overlapPeriodStart != -1 && overlapPeriodEnd != -1) {
			const auto& dutyStart = duty->getFirstPickup()->getStartTimeLocAct();
			const auto& dutyEnd = duty->getLastDropoff()->getEndTimeLocAct();
			if (!Utility::GetInstancePtr()->isTimesCoveredInRange(dutyStart, dutyEnd, 0, overlapPeriodStart, overlapPeriodEnd)) {
				continue;
			}
		}

		const auto& dutyStartDay = duty->getStartTimeLocAct() / (3600 * 24);
		const auto& dutyEndDay = duty->getEndTimeLocAct() / (3600 * 24);
		const auto& days = dutyEndDay - dutyStartDay + 1;
		if ((it->dutyDaysStart > 0 && it->dutyDaysEnd > 0) && (days < it->dutyDaysStart || days > it->dutyDaysEnd)) {
			continue;
		}
		fix = true;
		if (condition == "OR") {
			return true;
		}
	}
	return fix;
}
bool PairingAttributeCalculator::appendPairingTag(Pairing* pg, vector<SharedPtr<TAG_PAIRING>> tagPairings, string condition) {
	bool fix = false;
	bool dutyFix = true;
	int pairingLayoverNum = 0;
	for (int j = 0; j < (int)pg->getDutyVec().size() - 1; j++) {
		auto current = pg->getDutyVec().at(j);
		
		string layoverAirport = current->getArrivalStation();
		if (layoverAirport != pg->getBase()) {
			auto next = pg->getDutyVec().at(j + 1);

			time_t currentDay = current->getStartTimeLocAct() / (3600 * 24);
			time_t nextDay = next->getStartTimeLocAct() / (3600 * 24);
			pairingLayoverNum += static_cast<int>(nextDay - currentDay);
			current->setNumLayoverNights(static_cast<int>(nextDay - currentDay));
		}
	}

	const auto& lastDuty = pg->getLastDuty();

	for (auto & it : tagPairings) {
		if (condition == "OR" && fix) {
			return fix;
		}
		fix = false;
		dutyFix = true;
		int avgBlhLow = hhmmStrToMinutes(it->avgBlhLow);
		int avgBlhHigh = hhmmStrToMinutes(it->avgBlhHigh);
		int avgBlhPerSegLow = hhmmStrToMinutes(it->avgBlockPerSegLow);
		int avgBlhPerSegHigh = hhmmStrToMinutes(it->avgBlockPerSegHigh);
		int layoverDurationStart = hhmmStrToMinutes(it->layoverDurationStart);
		int layoverDurationEnd = hhmmStrToMinutes(it->layoverDurationEnd);

		vector<int> pairingLength;
		split(it->pairingLength.c_str(), '-', pairingLength);
		
		vector<string> layoverAirports;
		split(it->layover.c_str(), '|', layoverAirports);

		if (avgBlhLow != -1 && pg->getAverageBlk() * 60 < avgBlhLow) {
			continue;
		}
		if (avgBlhHigh != -1 && pg->getAverageBlk() * 60 > avgBlhHigh) {
			continue;
		}
		if (avgBlhPerSegLow != -1 && pg->getFlyingHours() * 60 / pg->getflySegments().size() < avgBlhPerSegLow) {
			continue;
		}
		if (avgBlhPerSegHigh != -1 && pg->getFlyingHours() * 60 / pg->getflySegments().size() > avgBlhPerSegHigh) {
			continue;
		}
		if (it->base.size() > 0 && it->base[0] != "*" && it->base[0] != "" && find(it->base.begin(), it->base.end(), pg->getBase()) == it->base.end()) {
			continue;
		}
		if (it->assignmentGroup.size() > 0 && it->assignmentGroup[0] != "*" && it->assignmentGroup[0] != "") {
			bool found = false;
			for (const auto& group : it->assignmentGroup) {
				if (isAssignmentInGroup(pg->getQualifier(), group)) {
					found = true;
					break;
				}
			}
			if (!found)
				continue;
		}
		
		if (pairingLength.size() == 2 && (pg->getNumCrewDays() < pairingLength[0] || pg->getNumCrewDays() > pairingLength[1])) {
			continue;
		}
		if (it->overNightDayStart != -1 && pairingLayoverNum < it->overNightDayStart) {
			continue;
		}
		if (it->overNightDayEnd != -1 && pairingLayoverNum > it->overNightDayEnd) {
			continue;
		}
		
		bool hasCountry = false;
		bool hasLayoverAirport = false;
		for (const auto & duty : pg->getDutyVec()) {
			if (!dutyFix) break;

			if (duty->getNumLayoverNights() > 0) {
				if (layoverAirports.size() > 0 && layoverAirports[0] != "" && layoverAirports[0] != "*" &&
					find(layoverAirports.begin(), layoverAirports.end(), duty->getArrivalStation()) != layoverAirports.end()) {
					hasLayoverAirport = true;
				}
				const auto& country = this->airportCodeMap[duty->getArrivalStation()]->country;
				if (it->exceptLayoverCountries.size() > 0 && it->exceptLayoverCountries[0] != "*" && find(it->exceptLayoverCountries.begin(), it->exceptLayoverCountries.end(), country) != it->exceptLayoverCountries.end()) {
					dutyFix = false;
					break;
				}
				if (it->layoverCountries.size() > 0 && it->layoverCountries[0] != "*" && find(it->layoverCountries.begin(), it->layoverCountries.end(), country) != it->layoverCountries.end()) {
					hasCountry = true;
				}
			}
		}

		if (it->layoverCountries.size() > 0 && !it->layoverCountries[0].empty() && it->layoverCountries[0] != "*" && !hasCountry) {
			continue;
		}

		if (layoverAirports.size() > 0 && layoverAirports[0] != "" && layoverAirports[0] != "*" && !hasLayoverAirport) {
			continue;
		}

		if (layoverAirports.size() > 0 && layoverAirports[0] != "" && layoverAirports[0] != "*" && pg->getDutyVec().size() == 1)
			continue;

		if (!dutyFix) {
			continue;
		}
		if (layoverDurationStart != -1 && layoverDurationEnd != -1) {
			bool foundLayover = false;
			int layover = 0;
			if (pg->getDutyVec().size() > 1) {
				for (int i = 0; i < (int)pg->getDutyVec().size() - 1; i++) {
					layover += static_cast<int>(pg->getDutyVec()[i + 1]->getStartTimeUtcAct() - pg->getDutyVec()[i]->getEndTimeUtcAct());
					
				}
			}

			if (layoverDurationStart * 60 <= layover && layover <= layoverDurationEnd * 60) {
				foundLayover = true;
			}
			if (!foundLayover)
				continue;
		}


		const auto& pairingDays = pg->getEndTimeUtcAct() - pg->getStartTimeUtcAct();
		int days = static_cast<int>(pairingDays / ((time_t)3600 * 24));
		if (pairingDays % (3600 * 24) > 0)
			++days;
		if (it->pairingDaysStart > 0 && it->pairingDayEnd > 0 && (days < it->pairingDaysStart || days > it->pairingDayEnd)) {
			continue;
		}

		if (it->atdoStart > 0 && it->atdoEnd > 0 && lastDuty) {
			if (lastDuty->getMinATDO() < it->atdoStart || lastDuty->getMinATDO() > it->atdoEnd)
				continue;
		}

		if (it->exdoStart > 0 && it->exdoEnd > 0 && lastDuty) {
			if (lastDuty->getMinEXDO() < it->exdoStart || lastDuty->getMinEXDO() > it->exdoEnd)
				continue;
		}

		fix = true;
	}
	return fix;
}

void PairingAttributeCalculator::calculateAndSetPairingAttr(vector<Pairing*>& pgs) {
	/*if (airline == "BR") {
		return ;
	}*/
	if (airline == "CA") {
		return;
	}

	for (auto& pg : pgs) {
		string oldManualAttr = getAttr(pg, "man");
		string oldInterfaceAttr = getAttr(pg, "intg");
		string attr = calculatePairingAttr(pg);

		vector<string> attrSet;
		split(oldManualAttr, '|', attrSet);
		split(oldInterfaceAttr, '|', attrSet);
		split(attr, '|', attrSet);
		stable_sort(attrSet.begin(), attrSet.end());
		attrSet.erase(unique(attrSet.begin(), attrSet.end()), attrSet.end());

		stringstream ss;
		for (auto& it : attrSet) {
			if (it != "") {
				ss << (ss.tellp() > 0 ? "|" : "");
				ss << it;
			}
		}
		//2022.11.27 Tiao 保留原来标签
		//10406: UI（下方状态栏）显示的attribute和数据库不符
		//string originalAttributes = pg->getAttribute();
		//originalAttributes = originalAttributes +"|"+ ss.str();
		pg->setAttribute(ss.str());
	}
}

void PairingAttributeCalculator::calculateAndSetPairingTag(vector<Pairing*>& pgs) {
	for (auto& pg : pgs) {
		string oldTag = getTagOld(pg);
		string tag = calculatePairingTag(pg);

		vector<string> tagSet;
		split(oldTag, '|', tagSet);
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
		
		pg->setAttribute(ss.str());

		for (auto& duty : pg->getDutyVec()) {
			string dutyTag = calculateDutyTag(pg, duty);

			vector<string> originalTagSet;
			vector<string> tagSet;
			split(duty->getAttributes(), '|', originalTagSet);
			for (auto& originalTag : originalTagSet) {
				if (originalTag == "") {
					continue;
				}
				if (tagCodeMap.find(originalTag) == tagCodeMap.end() || tagCodeMap[originalTag] == nullptr) {
					tagSet.push_back(originalTag);
					continue;
				}
				if (!isTagCategoryType(tagCodeMap[originalTag], "DUTY")) {
					tagSet.push_back(originalTag);
					continue;
				}
				if (strToUpper(tagCodeMap[originalTag]->source) == "RULE") {
					continue;
				}
				tagSet.push_back(originalTag);
			}
			split(dutyTag, '|', tagSet);
			stable_sort(tagSet.begin(), tagSet.end());
			tagSet.erase(unique(tagSet.begin(), tagSet.end()), tagSet.end());

			stringstream dutySs;
			for (auto& it : tagSet) {
				if (it != "") {
					dutySs << (dutySs.tellp() > 0 ? "|" : "");
					dutySs << it;
				}
			}

			duty->setAttributes(dutySs.str());
		}
	}
}

//PairingAttr: airport.category
void PairingAttributeCalculator::appendAirportAttr(map<string, bool>& airportCategorys, Segment* seg) {
	DBAirport* dep = airportCodeMap[seg->getDepStation()];
	DBAirport* arv = airportCodeMap[seg->getArrStation()];
	if (dep && !dep->category.empty()) {
		airportCategorys[dep->category] = true;
	}
	if (arv) {
		airportCategorys[arv->category] = true;
	}
}

//PairingAttr: segment route attr
void PairingAttributeCalculator::appendRouteAttr(stringstream& ss, map<long long, bool>& AndRouteIds, map<long long, bool>& OrRouteIds, Segment* seg) {
	string fltNum = seg->getFlightNumber();
	string dep = seg->getDepStation();
	string arv = seg->getArrStation();

	if (routeFltNumMap.find(fltNum) != routeFltNumMap.end()) {
		findRoute(routeFltNumMap[fltNum], seg, AndRouteIds, OrRouteIds);
	}
	if (routeDepMap.find(dep) != routeDepMap.end()) {
		findRoute(routeDepMap[dep], seg, AndRouteIds, OrRouteIds);
	}
	if (routeArvMap.find(arv) != routeArvMap.end()) {
		findRoute(routeArvMap[arv], seg, AndRouteIds, OrRouteIds);
	}
	//支持全通配行: route.fltNum/dep/arv都为空
	if (routeFltNumMap.find("") != routeFltNumMap.end()) {
		findRoute(routeFltNumMap[""], seg, AndRouteIds, OrRouteIds);
	}
}

//PairingAttr: pairing durationDays
void PairingAttributeCalculator::appendPairingDaysAttr(stringstream& ss, Pairing* pg) {
	if (!pg || pg->getNumDuties() == 0) {
		return;
	}
	Duty * firstDuty = pg->getDuty(0);
	Duty * lastDuty = pg->getDuty(pg->getNumDuties() - 1);
	int days = 1 + static_cast<int>(getStartTimeOfDay(lastDuty->getStartTimeLocSch()) - getStartTimeOfDay(firstDuty->getStartTimeLocSch())) / (24 * 3600);

	ss << (ss.tellp() > 0 ? "|" : "");
	ss << days;
}

//20190704 ain, OP#2224, 汇总 fatigue = sum(duty.faigue)
void PairingAttributeCalculator::appendPairingFatigueAttr(stringstream& ss, Pairing* pg) {
	if (!pg || pg->getNumDuties() == 0) {
		return;
	}
	double sum = 0;
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty * d = pg->getDuty(i);
		sum += d->getTotalFatiguePoints();
	}

	if (sum > 0) {
		ss << (ss.tellp() > 0 ? "|" : "");
		ss << "F" << sum;
	}
}

//寻找 Route
//匹配seg的OR Route作为返回，
//匹配seg的AND Route 加入 andRouteIds
void PairingAttributeCalculator::findRoute(vector<SharedPtr<Route>>& list, Segment* seg, map<long long, bool>& andRouteIds, map<long long, bool>& orRouteIds) {
	SharedPtr<Route> routeWithOrOp;
	for (auto& item : list) {
		//skip route already in result
		if (andRouteIds.find(item->routeId) != andRouteIds.end() || orRouteIds.find(item->routeId) != orRouteIds.end()) {
			continue;
		}

		if (item->fltNum != "" && item->fltNum != "*" && item->fltNum != seg->getFlightNumber()) {
			continue;
		}
		if (item->depArp != "" && item->depArp != "*" && item->depArp != seg->getDepStation()) {
			continue;
		}
		if (item->arvArp != "" && item->arvArp != "*" && item->arvArp != seg->getArrStation()) {
			continue;
		}
		if (item->flt_dt_start != 0 && item->flt_dt_start - seg->getStartTimeLocSch() >= 0) {
			continue;
		}
		if (item->flt_dt_end != 0 && item->flt_dt_end - seg->getStartTimeLocSch() < 0) {
			continue;
		}

		//20190324 aini, OP#2022
		//20190524 ain, mantis#5728, 因 seg.domIntType可能为空, 改为从flt获取
		string domIntType = seg->getDomIntType();
		if (fltIdMap.find(seg->getDBId()) != fltIdMap.end()) {
			domIntType = fltIdMap[seg->getDBId()]->getDomIntType();
		}
		if (item->segType != "" && item->segType != "*" && item->segType != domIntType) {
			continue;
		}

		if (attrIdMap.find(item->routeId) == attrIdMap.end()) {
			continue;
		}
		
		string operation = strToUpper(attrIdMap[item->routeId].operation);
		//for AND
		if (operation == "AND") {
			andRouteIds[item->routeId] = true;
		}
		//for OR
		if (operation != "AND") {
			orRouteIds[item->routeId] = true;
		}
	}
}

//寻找 Attr
//ptn.attr -> Attribute.source 匹配参数 source 作为返回，
//return A|B|C|...
string PairingAttributeCalculator::getAttr(Pairing* pg, string source) {

	string attributeStr = pg->getAttribute();
	stringstream ss;

	if (attributeStr.empty()) {
		return ss.str();
	}

	vector<string> attributes;
	split(attributeStr, '|', attributes);

	for (auto& attr : attributes) {
		if (attrCodeMap.find(attr) != attrCodeMap.end() && attrCodeMap[attr].source == source && attrCodeMap[attr].code != "") {
			ss << (ss.tellp() > 0 ? "|" : "");
			ss << attrCodeMap[attr].code;
		}
	}

	return ss.str();
}

string PairingAttributeCalculator::getTagOld(Pairing* pg) {
	return getTagOld(pg->getAttribute(), "PAIRING");
}

string PairingAttributeCalculator::getTagOld(const string& tagStr, const string& expectedType) {
	stringstream ss;
	if (tagStr.empty()) {
		return ss.str();
	}

	vector<string> tags;
	split(tagStr, '|', tags);

	for (auto& tag : tags) {
		if (tagCodeMap.find(tag) == tagCodeMap.end() || tagCodeMap[tag] == nullptr) {
			continue;
		}
		if (tagCodeMap[tag]->code == "") {
			continue;
		}
		if (!isManualOrInterfaceTagSource(tagCodeMap[tag]->source)) {
			continue;
		}
		if (!isTagCategoryType(tagCodeMap[tag], expectedType)) {
			continue;
		}

		ss << (ss.tellp() > 0 ? "|" : "");
		ss << tagCodeMap[tag]->code;
	}

	return ss.str();
}

bool PairingAttributeCalculator::isTagCategoryType(const SharedPtr<TAG_CATEGORY>& tagCategory, const string& expectedType) const {
	if (tagCategory == nullptr) {
		return false;
	}

	const string type = strToUpper(trim(tagCategory->type));
	if (type.empty()) {
		return expectedType == "PAIRING";
	}
	return type == strToUpper(expectedType);
}

bool PairingAttributeCalculator::isAssignmentInGroup(string assignment, string group) {
	
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

time_t PairingAttributeCalculator::getFDPStartUtcTimes(Duty* duty, string type, int brief)
{
	time_t staTm = 0;
	int iActCheckin = duty->getActualBriefMin();
	if (0 == iActCheckin)
		iActCheckin = duty->getMinBrief();

	if (brief != 0) {
		iActCheckin = brief;
	}
	int pickup = duty->getActualPickupMin();

	const auto& seg = duty->getFirstSegment();

	if ((isAssignmentInGroup(seg->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount)
		|| (isAssignmentInGroup(seg->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY)
		|| (isAssignmentInGroup(seg->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround)
		|| (isAssignmentInGroup(seg->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay)
		|| (isAssignmentInGroup(seg->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB))
	{
		//20190723 ain, mantis#6286, 容忍 ptn/duty为空
		Segment* firstSeg = duty->getFirstSegment();
		staTm = firstSeg ? firstSeg->getStartTimeUtc(type) : duty->getStartTimeUtc(type);

		if (RuleParams::GetInstancePtr()->bPickupCount && pickup > 0)
			staTm -= pickup * 60;

		if (RuleParams::GetInstancePtr()->bIncludeCI && iActCheckin > 0)
			staTm -= iActCheckin * 60;
	}
	else
	{
		//20190702 mantis#6131 duty内可能没有flySeg
		//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
		string airline = AssignmentHolder::getAirline();
		Segment* firstSeg = airline == "BR" ? duty->getFirstFlySegment() : duty->getFirstFdpSegment();
		staTm = firstSeg != NULL ? firstSeg->getStartTimeUtc(type) : duty->getStartTimeUtc(type);
		if (staTm == duty->getFirstSegment()->getStartTimeUtc(type))
		{
			if (RuleParams::GetInstancePtr()->bPickupCount && pickup > 0)
				staTm -= pickup * 60;

			if (RuleParams::GetInstancePtr()->bIncludeCI && iActCheckin > 0)
				staTm -= iActCheckin * 60;
		}

	}
	return staTm;
}

time_t PairingAttributeCalculator::getFDPEndUtcTimes(Duty* duty, string type)
{
	time_t endTm = 0;

	//if (this->getPairingId() == 27473304)
	//	printf("");

	int iActCheckout = duty->getActualDebriefMin();
	if (0 == iActCheckout)
		iActCheckout = duty->getMinDebrief();

	int dropoff = duty->getActualDropoffMin();
	const auto& seg = duty->getLastSegment();
	if ((isAssignmentInGroup(seg->getAssignment(), "DHD") && RuleParams::GetInstancePtr()->bIncludeLastDHD)
		|| (isAssignmentInGroup(seg->getAssignment(), "SBY") && RuleParams::GetInstancePtr()->bIncludePostSBY)
		|| (isAssignmentInGroup(seg->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround)
		|| (isAssignmentInGroup(seg->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay)
		|| (isAssignmentInGroup(seg->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB)
		)
	{
		endTm = duty->getLastSegment()->getEndTimeUtc(type);
		if (RuleParams::GetInstancePtr()->bIncludeCO && iActCheckout > 0)
			endTm += iActCheckout * 60;
		if (RuleParams::GetInstancePtr()->bDropoffCount && dropoff > 0)
			endTm += dropoff * 60;
	}
	else
	{
		//20180530 ain, mantis#3403, 针对 duty=P 只包含bus的 duty, 返回fdpEnd=0
		//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
		string airline = AssignmentHolder::getAirline();
		Segment* lastSeg = airline == "BR" ? duty->getLastFlySegment() : duty->getLastFdpSegment();
		endTm = lastSeg != NULL ? lastSeg->getEndTimeUtc(type) : 0;

		if (endTm == duty->getLastSegment()->getEndTimeUtc(type))
		{
			if (RuleParams::GetInstancePtr()->bIncludeCO && iActCheckout > 0)
				endTm += iActCheckout * 60;
			if (RuleParams::GetInstancePtr()->bDropoffCount && dropoff > 0)
				endTm += dropoff * 60;
		}
	}

	//按照2107法规固定增加FIXED EXTENSTION设置值
	endTm += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP) + 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);

	// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
	if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {
		endTm += RuleParams::GetInstancePtr()->postActivityThreshold * 60;
		const auto& lastFdpSegment = duty->getLastFdpSegment();
		if (lastFdpSegment) {
			const auto& index = lastFdpSegment->getSegSeq();
			if (index < (int)duty->getNumSegments()) {
				int transitTime = static_cast<int>(duty->getSegments()[index]->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT"));
				if (transitTime < RuleParams::GetInstancePtr()->postActivityThreshold * 60) {
					endTm -= RuleParams::GetInstancePtr()->postActivityThreshold * 60 - transitTime;
				}
			}
		}
	}

	return endTm;
}
