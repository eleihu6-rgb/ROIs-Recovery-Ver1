/**
 * @file LimitConsecutiveDutyDaysOffForHXRule.cpp
 * @brief 日历月最少N次连续X个DDO规则类实现
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-28
**/

#include "../RuleSytem.h"
#include "LimitConsecutiveDutyDaysOffForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"
#include "RuleParams.h"

//返回值<Manday日期(本地时区)，Manday对象>
inline static unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> GetMandayMap(const std::shared_ptr<CREW>& crew) {
	unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> mandayMap;
	const auto& mandayFds = crew->mandayFdList;
	const auto& mandayCcAm = crew->mandayCcAmList;
	bool isFd = crew->division == "P";
	if (isFd) {
		for (size_t i = 0; i < mandayFds.size(); i++) {
			const auto& manday = mandayFds[i];
			mandayMap[manday->dateLoc] = manday;
		}
	}
	else {
		for (size_t m = 0; m < mandayCcAm.size(); m++) {
			const auto& manday = mandayCcAm[m];
			mandayMap[manday->dateLoc] = manday;
		}
	}

	return mandayMap;
}

void LimitConsecutiveDutyDaysOffForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(ConsecutiveDutyDaysOffForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	auto it = input.dependDbRules.find(RULES::ANR_DAY_OFF_DEFINITION);
	if (it != input.dependDbRules.end()) {
		_dayOffDefinition.loadFromDbRules(it->second);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(ConsecutiveDutyDaysOffForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

bool LimitConsecutiveDutyDaysOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	std::string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();

	time_t checkedStartTime = this->_dbData->scenario.startDtUTC;
	time_t checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;

	checkedStartTime = std::min(checkedStartTime, rosters.front()->actStrUtc);
	checkedEndTime = std::max(checkedEndTime, rosters.back()->restStrUtc);

	unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> crewMandayMap = GetMandayMap(crew);

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crewMandayMap, checkedStartTime, checkedEndTime, weekdayStartFrom, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}

	return passAllRule;
}

bool LimitConsecutiveDutyDaysOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const {
	bool passAllRule = true;

	int period = ruleParam.GetPeriod();
	string unit = ruleParam.GetUnit();
	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(unit, std::to_string(period), checkedStartTime, checkedEndTime, weekdayStartFrom, offsetTZMinutes);

	for (auto& pair : mpRange)
	{
		time_t rangeStartTimeUtc = pair.first;
		time_t rangeEndTimeUtc = pair.second;

		bool valid = CheckRule(rosters, crewMandayMap, crew, rangeStartTimeUtc, rangeEndTimeUtc, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool LimitConsecutiveDutyDaysOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const std::shared_ptr<CREW>& crew, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const {
	vector<time_t> ddoDates = GetDaysOffDates(rosters, crewMandayMap, rangeStartTimeUtc, rangeEndTimeUtc, crew, offsetTZMinutes, ruleParam);
	if (ddoDates.empty()) {
		return true;
	}
	int occurrences = CountConsecutiveDaysOffOccurrences(ddoDates, ruleParam.GetConsecutiveDaysOff());
	if (occurrences < ruleParam.GetMinTimes() || occurrences > ruleParam.GetMaxTimes()) {
		ThrowRuleViolation(rangeStartTimeUtc, rangeEndTimeUtc, occurrences, ruleParam);
		return false;
	}
	return true;
}

vector<time_t> LimitConsecutiveDutyDaysOffForHXRule::GetDaysOffDates(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const {
	auto& dayOffDefineEx = _dayOffDefinition.getReqExRow();

	vector<time_t> daysOffFromManday = GetDaysOffFromManday(rosters, crew, checkedStartTime, checkedEndTime, offsetTZMinutes, dayOffDefineEx.isBlankDayCountedDO, ruleParam);

	vector<std::tuple<time_t, time_t>> dayOffPeriods = _dayOffDefinition.getDaysOffPeriodsByRoster(rosters, crewMandayMap, this->_dbData, checkedStartTime, checkedEndTime, offsetTZMinutes);
	vector<time_t> daysOffFromRosters = _dayOffDefinition.getDaysOffDates(dayOffPeriods);

	//allDaysOffDates存储所有拥有DDO日期列表
	vector<time_t> allDaysOffDates = daysOffFromManday;
	allDaysOffDates.insert(allDaysOffDates.end(), daysOffFromRosters.begin(), daysOffFromRosters.end());
	sort(allDaysOffDates.begin(), allDaysOffDates.end());
	allDaysOffDates.erase(std::unique(allDaysOffDates.begin(), allDaysOffDates.end()), allDaysOffDates.end());
	//sort(allDaysOffDates.begin(), allDaysOffDates.end());
	return allDaysOffDates;
}

vector<time_t> LimitConsecutiveDutyDaysOffForHXRule::GetDaysOffFromManday(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew,
	const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes,
	const bool isCountBlankDay, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const {

	vector<time_t> daysOffDateInManday;//记录Manday中的DDO日期

	time_t rostersStartDayLoc = this->_dbData->scenario.startDtUTC + (time_t)offsetTZMinutes * 60;
	time_t rostersEndDayLoc = this->_dbData->scenario.endDtUTC + (time_t)offsetTZMinutes * 60;
	if (!rosters.empty()) {
		rostersStartDayLoc = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->getStartTimeLocAct(), 0);
		rostersEndDayLoc = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->getRestStartLocAct(), 0) + 86400 - 1;
	}

	time_t rangeStartTimeLoc = rangeStartTimeUtc + (time_t)(offsetTZMinutes * 60);
	time_t rangeEndTimeLoc = rangeEndTimeUtc + (time_t)(offsetTZMinutes * 60);
	if (crew->division == "P")
	{
		for (size_t i = 0; i < crew->mandayFdList.size(); i++) {
			std::shared_ptr<CREW_MANDAY_BASIC> prevManday = (i == 0 ? nullptr : crew->mandayFdList[i - 1]);
			std::shared_ptr<CREW_MANDAY_BASIC> currManday = crew->mandayFdList[i];
			vector<time_t> tmpDaysOffDateInManday = GetDaysOffFromManday(prevManday, currManday, rostersStartDayLoc, rostersEndDayLoc, rangeStartTimeLoc, rangeEndTimeLoc, isCountBlankDay, ruleParam);
			daysOffDateInManday.insert(daysOffDateInManday.end(), tmpDaysOffDateInManday.begin(), tmpDaysOffDateInManday.end());
		}
	}
	else {
		for (size_t i = 0; i < crew->mandayCcAmList.size(); i++) {
			std::shared_ptr<CREW_MANDAY_BASIC> prevManday = (i == 0 ? nullptr : crew->mandayCcAmList[i - 1]);
			std::shared_ptr<CREW_MANDAY_BASIC> currManday = crew->mandayCcAmList[i];
			vector<time_t> tmpDaysOffDateInManday = GetDaysOffFromManday(prevManday, currManday, rostersStartDayLoc, rostersEndDayLoc, rangeStartTimeLoc, rangeEndTimeLoc, isCountBlankDay, ruleParam);
			daysOffDateInManday.insert(daysOffDateInManday.end(), tmpDaysOffDateInManday.begin(), tmpDaysOffDateInManday.end());
		}
	}

	return daysOffDateInManday;
}

vector<time_t> LimitConsecutiveDutyDaysOffForHXRule::GetDaysOffFromManday(const std::shared_ptr<CREW_MANDAY_BASIC>& prevManday, const std::shared_ptr<CREW_MANDAY_BASIC>& currManday,
	const time_t rostersStartDayLoc, const time_t rostersEndDayLoc, const time_t rangeStartTimeLoc, const time_t rangeEndTimeLoc,
	const bool isCountBlankDay, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const {
	vector<time_t> daysOffDateInManday;//记录Manday中的DDO日期
	if ((currManday->dateLoc >= rangeStartTimeLoc && currManday->dateLoc < rostersStartDayLoc)
		|| (currManday->dateLoc < rangeEndTimeLoc && currManday->dateLoc >  rostersEndDayLoc)) {
		//currManday在rosters时间范围外，在rangeStartTimeLoc到rangeEndTimeLoc之间，统计DDO数量

		if (isCountBlankDay) {
			//空白天算DDO（可能存在问题不满足DDO定义，需要根据实际情况调整）
			time_t prevMandayLoc = rangeStartTimeLoc;
			if (prevManday != nullptr &&
				((prevManday->dateLoc >= rangeStartTimeLoc && prevManday->dateLoc < rostersStartDayLoc)
					|| (prevManday->dateLoc < rangeEndTimeLoc && prevManday->dateLoc >  rostersEndDayLoc))) {
				prevMandayLoc = prevManday->dateLoc;
			}

			for (time_t dayOffDate = prevMandayLoc + 86400; dayOffDate < currManday->dateLoc; dayOffDate += 86400) {
				daysOffDateInManday.emplace_back(dayOffDate);
			}
		}

		if (currManday->DAY_OFF == DAY_OFF_EXIST) {
			daysOffDateInManday.emplace_back(currManday->dateLoc);
		}
	}
	return daysOffDateInManday;
}

int LimitConsecutiveDutyDaysOffForHXRule::CountConsecutiveDaysOffOccurrences(const vector<time_t>& ddoDates, const int consecutiveDaysOff) const {
	if (ddoDates.empty() || consecutiveDaysOff <= 1) {
		return 0;
	}

	int occurrences = 0;
	int consecutiveCount = 1;

	for (size_t i = 1; i < ddoDates.size(); i++) {
		time_t prevDate = ddoDates[i - 1];
		time_t currDate = ddoDates[i];

		if (currDate - prevDate == 24 * 3600) {
			consecutiveCount++;
		}
		else {
			consecutiveCount = 1;
		}

		if (consecutiveCount >= consecutiveDaysOff) {
			occurrences++;
			i++;
			consecutiveCount = 1;
		}
	}

	if (consecutiveCount >= consecutiveDaysOff) {
		occurrences++;
	}

	return occurrences;
}

void LimitConsecutiveDutyDaysOffForHXRule::ThrowRuleViolation(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int occurrences, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const {
	//连续n天不满足DO数量
	//在{0:period}{1:unit}单位内，需安排至少{2:consecutiveDaysOff}组，每组包含{3:minTimes}-{4:maxTimes}天的连续休息日。
	string msg = "Minimum ({0:consecutiveDaysOff}) groups of ({1:minTimes}-{2:maxTimes}) consecutive days off required in {3:period}{4:unit}.";
	msg = StringUtils::Format(msg, ruleParam.GetConsecutiveDaysOff(), ruleParam.GetMinTimes(), ruleParam.GetMaxTimes(),
		ruleParam.GetPeriod(), ruleParam.GetUnit());

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
	rv->operation_result.insert(pair<string, string>("occurrences", std::to_string(occurrences)));
	_ruleViolation.AddRuleViolations(rv);
}

