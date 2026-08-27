/**
 * @file LimitMaxAttributesNumberBasedMandayForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#include "../RuleSytem.h"
#include "LimitMaxAttributesNumberBasedMandayForPRRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"

bool LimitMaxAttributesNumberBasedMandayForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
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

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(checkedStartTime, checkedEndTime, weekdayStartFrom, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool LimitMaxAttributesNumberBasedMandayForPRRule::CheckRule(const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const {
	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(ruleParam._periodUnit, std::to_string(ruleParam._period), checkedStartTime, checkedEndTime, weekdayStartFrom, offsetTZMinutes);
	bool valid = true;
	map<time_t, std::tuple<time_t,int>> startTimeCountMap;//map<Range开始时间, tuple<Range结束时间,Attribute数量>>
	if (crew->division == "P") {
		for (auto& manday : crew->mandayFdList) {
			statStartTimeCountMap(startTimeCountMap, mpRange, manday, ruleParam);
		}
	}
	else {
		for (auto& manday : crew->mandayCcAmList) {
			statStartTimeCountMap(startTimeCountMap, mpRange, manday, ruleParam);
		}
	}

	for (auto& pair : startTimeCountMap) {
		time_t rangeStartTimeUtc = pair.first;
		time_t rangeEndTimeUtc = std::get<0>(pair.second);
		int total = std::get<1>(pair.second);
		if (total > ruleParam._maxAttributesNum) {
			valid = false;
			if (!IsCheckAllRule()) {
				return valid;
			}
			ThrowRuleViolation(rangeStartTimeUtc, rangeEndTimeUtc, total, ruleParam);
		}
	}
	return valid;
}

void LimitMaxAttributesNumberBasedMandayForPRRule::statStartTimeCountMap(map<time_t, std::tuple<time_t, int>>& startTimeCountMap, const map<time_t, time_t>& mpRange, const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const {
	for (auto& range : mpRange) {
		time_t rangeStartTimeUtc = range.first;
		time_t rangeEndTimeUtc = range.second;

		if (manday != nullptr && !PhaseUtils::IsChecked(manday, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (manday->crewDateUtc >= rangeStartTimeUtc && manday->crewDateUtc <= rangeEndTimeUtc) {
			int count = GetAttributesCount(manday, ruleParam);

			auto iter = startTimeCountMap.find(rangeStartTimeUtc);
			if (iter != startTimeCountMap.end()) {
				int& total = std::get<1>(iter->second);
				total += count; //累计
			}
			else {
				startTimeCountMap.insert(std::make_pair(rangeStartTimeUtc, std::make_tuple(rangeEndTimeUtc, count)));
			}
		}
	}
}

int LimitMaxAttributesNumberBasedMandayForPRRule::GetAttributesCount(const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const {
	int count = 0;
	if (ruleParam._attributes.empty()) {
		return 0;
	}
	for (auto& attr : ruleParam._attributes) {
		if (ruleParam._uniqueDayAttribute == nullptr) {
			//Unique Day Attribute = *, 有几个标签算几个(Crew在一天内,n个相同标签仅记录n次)
			//TODO
			count += (int)StringUtils::Count(manday->attributes, attr);
		}
		else if (*(ruleParam._uniqueDayAttribute.get())) {
			//Unique Day Attribute = Y, 则Crew在一天内符合条件标签数量最多计为1 （或者0）
			if (manday->attributes.find(attr) != string::npos) {
				count++;
				break;
			}
		}
		else {
			//Unique Day Attribute = N, 标签维度唯一(Crew在一天内,n个相同标签仅记录1次)
			if (manday->attributes.find(attr) != string::npos) {
				count++;
			}
		}

	}
	return count;
}

void LimitMaxAttributesNumberBasedMandayForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitMaxAttributesNumberBasedMandayForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitMaxAttributesNumberBasedMandayForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitMaxAttributesNumberBasedMandayForPRRule::ThrowRuleViolation(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int actTotal, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const {
	if (this->IsPairingOptimizerModel() || this->IsRosterOptimizerModel()) {
		return;
	}

	//在周期内，实际标签数量超过最大数量
	string msg = "The number of rosters ({0:actTotal}) with ({1:attrs}) exceeds the threshold ({2:maxAttributesNum}) in {3:period}{4:periodUnit}.";
	msg = StringUtils::Format(msg, actTotal, ruleParam._strAttributes, ruleParam._maxAttributesNum, ruleParam._period,  ruleParam._periodUnit);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = rangeStartTimeUtc;
	rv->endDTUtc = rangeEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("actAttributesNum", std::to_string(actTotal)));
	rv->operation_result.insert(pair<string, string>("maxAttributesNum", std::to_string(ruleParam._maxAttributesNum)));
	rv->operation_result.insert(pair<string, string>("period", std::to_string((ruleParam._period))));
	rv->operation_result.insert(pair<string, string>("periodUnit", ruleParam._periodUnit));

	_ruleViolation.AddRuleViolations(rv);
}
