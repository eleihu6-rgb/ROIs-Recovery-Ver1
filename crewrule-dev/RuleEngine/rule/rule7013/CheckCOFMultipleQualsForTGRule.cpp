#include "CheckCOFMultipleQualsForTGRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CheckCOFMultipleQualsForTGRuleParam.h"

#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"


//按crew检查
bool CheckCOFMultipleQualsForTGRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool isValid = true;
	if (rosters.empty()) {
		return true;
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	const auto & crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	/*if (crew->idCrew == "30112") {
		printf("");
	}*/
	_ruleViolation.SetParam("crew_id", crew->idCrew);
	long long flt_id = 0L;
	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("crew", "Base:" + joinStrList(ruleParam._bases, "|") + " Rank:" + joinStrList(ruleParam._ranks, "|") + " Fleet:" + joinStrList(ruleParam._fleets, "|") + " Team:" + joinStrList(ruleParam._teams, "|"));
		std::vector<std::string> quals;
		const auto & paramQuals = ruleParam._quals;
		for (const auto & q : paramQuals) {
			if (isStartWithDigit(q)) {
				int qualNum = atoi(q.substr(0, 1).c_str());
				string qual = q.substr(1);
				for (int i = 0; i < qualNum; i++)
					quals.push_back(qual);
			}
			else {
				quals.push_back(q);
			}
		}

		multimap<string, std::tuple<Activity*,std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
		for (const auto& roster : rosters)
		{
			auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(roster, this->_dbData->qualExtensionConfigMap);
			qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());
			//for (auto& pair : tmpQualExtensionConfigsForQualMap) {
			//	qualExtensionConfigsForQualMap.insert(std::make_pair(pair.first, std::make_tuple(const_cast<ROSTER*>(roster), pair.second)));
			//}

			if (!(roster->pairing))
				continue;

			//忽略已经检查的ROSTER
			if (this->_application == ROSTER_OPTIMIZER)
			{
				if (roster->source != "CR" || !(roster->needRuleCheck))
					continue;
			}

			if (ruleParam._assignments.size() > 0 && ruleParam._assignments[0] != "*" && std::find(ruleParam._assignments.begin(), ruleParam._assignments.end(), roster->duty) == ruleParam._assignments.end())
				continue;

			if (ruleParam._attributes.size() > 0 && ruleParam._attributes[0] != "*")
			{
				const string& fltAttr = roster->pairing->getAttribute();
				//Does fltAttr contains one of strAttributes
				bool bHas = false;

				//for (vector<string>::iterator oneAtt = vAttributes.begin(); oneAtt != vAttributes.end(); ++oneAtt)
				for (const auto& oneAtt : ruleParam._attributes)
				{
					if (fltAttr.find(oneAtt) != std::string::npos)
					{
						bHas = true;
						break;
					}
				}
				if (!bHas)
					continue;
			}
			
			int compositionCrewNum = 0;
			int planCompositionCrewNum = 0;
			for (const auto & it : roster->pairing->getComplements()) {
				planCompositionCrewNum += it.second;
				if (ruleParam._actingRanks.size() == 0 || ruleParam._actingRanks[0] == "*" || find(ruleParam._actingRanks.begin(), ruleParam._actingRanks.end(), it.first) != ruleParam._actingRanks.end()) {
					compositionCrewNum += it.second;
				}
			}
			if (ruleParam._pilot > 0 && compositionCrewNum != ruleParam._pilot)
				continue;

			if (compositionCrewNum < (int)quals.size())
				continue;

			if (roster->pairing->getNumDuties() == 0)
				continue;

			for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
			{
				Duty* duty = roster->pairing->getDuty(di);
				for (std::size_t si = 0; si < duty->getNumSegments(); si++)
				{
					Segment* segment = duty->getSegment(si);

					if ((segment->getAssignment() == "DHD") || (segment->getAssignment() == "TVL"))
						continue;

					if (ruleParam._flightAssignments.size() > 0 && ruleParam._flightAssignments[0] != "*" 
						&& std::find(ruleParam._flightAssignments.begin(), ruleParam._flightAssignments.end(), segment->getAssignment()) == ruleParam._flightAssignments.end())
						continue;
					if (ruleParam._airports.size() > 0 && ruleParam._airports[0] != "*" && std::find(ruleParam._airports.begin(), ruleParam._airports.end(), segment->getDepStation()) == ruleParam._airports.end()
						&& std::find(ruleParam._airports.begin(), ruleParam._airports.end(), segment->getArrStation()) == ruleParam._airports.end())
						continue;

					if (ruleParam._flightNumbers.size() > 0 && ruleParam._flightNumbers[0] != "*" && std::find(ruleParam._flightNumbers.begin(), ruleParam._flightNumbers.end(), segment->getFlightNumber()) == ruleParam._flightNumbers.end())
						continue;

					flt_id = segment->getDBId();
					const time_t start = segment->getStartTimeUtcAct();
					const time_t end = segment->getEndTimeUtcAct();


					const auto& rfs = this->_dbData->rosterFlightMgr.get(flt_id);
					int crewOnflt = (int)rfs.size();
					if (ruleParam._actingRanks.size() > 0 && ruleParam._actingRanks[0] != "*") {
						crewOnflt = 0;
						for (const auto & rf : rfs) {
							if (find(ruleParam._actingRanks.begin(), ruleParam._actingRanks.end(), rf->actingRank) != ruleParam._actingRanks.end())
								++crewOnflt;
						}
					}
					
					if (compositionCrewNum - crewOnflt >= (int)quals.size())
						continue;
					
					std::unordered_map<std::string, std::vector<std::string>> qualToCrews;
					for (const auto & qual : quals) {
						std::vector<std::string> crewIds;
						for (const auto & rf : rfs) {
							if (ruleParam._actingRanks.size() > 0 && ruleParam._actingRanks[0] != "*" && std::find(ruleParam._actingRanks.begin(), ruleParam._actingRanks.end(), rf->actingRank) != ruleParam._actingRanks.end())
								continue;
							string crewId = rf->crewId;
							auto iter = this->_dbData->crewIdMap.find(crewId);
							if (iter == this->_dbData->crewIdMap.end() || iter->second == nullptr) {
								continue;
							}
							const auto & crewQuals = iter->second->qualificationList;
							for (const auto & cq : crewQuals) {
								time_t qualStart = cq->issuedUtc;
								time_t qualEnd = cq->expiryUtc;
								if (qualEnd < 0)
									qualEnd = end + 24 * 3600;
								if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
									auto qualPeriod = RosterUtils::GetQualExtension(cq, qualExtensionConfigsForQualMap);
									qualStart = std::get<0>(qualPeriod);
									qualEnd = std::get<1>(qualPeriod);
								}
								if ((qualStart < start) && (qualEnd >= end)) {
									if (cq->qual == qual) {
										crewIds.push_back(crewId);
										break;
									}
								}
							}
						}
						qualToCrews.insert({ qual, crewIds });
					}
					std::vector<std::string> visitedCrewIds;
					int needQualNum = (int)quals.size() - (compositionCrewNum - crewOnflt);
					if (!MatchCrewQual(quals, 0, visitedCrewIds, qualToCrews, needQualNum)) {
						_ruleViolation.SetParam("start", to_string(roster->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(roster->getRestStartUtcAct()));
						_ruleViolation.SetParam("quals", joinStrList(quals, "+"));
						_ruleViolation.SetParam("pairing_id", to_string(roster->pairId));
						ThrowRuleViolation();
						if (this->_application == ROSTER_OPTIMIZER)
							return false;
					}
					
				}
			}
		}
	}

	return isValid;
}

void CheckCOFMultipleQualsForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckCOFMultipleQualsForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool CheckCOFMultipleQualsForTGRule::MatchCrewQual(std::vector<std::string> &quals, int qualIdx, std::vector<std::string> &visitedCrewIds,
	std::unordered_map<std::string, std::vector<std::string>> &qualToCrews, int needQualNum) const {
	if (qualIdx == quals.size()) {
		if ((int)visitedCrewIds.size() < needQualNum)
			return false;
		return true;
	}
	auto& crewIds = qualToCrews.at(quals.at(qualIdx));
	if (crewIds.size() == 0) {

		if (needQualNum == quals.size())
			return false;
		if (MatchCrewQual(quals, qualIdx + 1, visitedCrewIds, qualToCrews, needQualNum)) {
			return true;
		}
	}
	for (auto& crewId : crewIds) {
		if (std::find(visitedCrewIds.begin(), visitedCrewIds.end(), crewId) != visitedCrewIds.end())
			continue;
		visitedCrewIds.push_back(crewId);
		if (visitedCrewIds.size() == needQualNum)
			return true;
		if (MatchCrewQual(quals, qualIdx + 1, visitedCrewIds, qualToCrews, needQualNum)) {
			return true;
		}
		visitedCrewIds.pop_back();
	}
	return false;
}

bool CheckCOFMultipleQualsForTGRule::isStartWithDigit(string str) const {
	if (str.empty())
		return false;
	if (isdigit(str[0]) != 0) {
		return true;
	}
	return false;
}




void CheckCOFMultipleQualsForTGRule::ThrowRuleViolation() const {
	string errorMsg = "Pairing ({0:pairing_id}) requires qualification ({1:quals}) for crew {2:crew}.";
	errorMsg = StringUtils::Format(errorMsg, _ruleViolation.GetParam("pairing_id"), _ruleViolation.GetParam("quals"), _ruleViolation.GetParam("crew"));

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->violation_msg = errorMsg;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->pairingId = StringUtils::stoll(_ruleViolation.GetParam("pairing_id"), 0);
	rv->idRule = _ruleParams[0].GetId();
	rv->description = _ruleParams[0].GetDescription();
	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}