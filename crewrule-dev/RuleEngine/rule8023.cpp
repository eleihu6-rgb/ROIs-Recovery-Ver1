#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <cmath>
#include <iostream>

#if defined(__unix) || defined(__APPLE__)
#include <ctime>
#endif

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/TimeUtils.h"
#include "utils/PhaseUtils.h"	
#include "TimezoneUtils.h"

struct WorkBlock
{
	time_t startTimeLoc = 0;
	time_t endTimeLoc = 0;
	vector<string> assignments{};
	bool isDo = false;
};

namespace {

/* Roster Period (RP) local calendar per business rules:
   - "January" RP: Jan 1–Jan 30
   - "February" RP: Jan 31 through Mar 1 inclusive (next period starts Mar 2)
   - "March" RP: Mar 2–Mar 31
   - April–December: standard calendar month */

time_t rpLocalYmdToUtcMidnight(int year, int month1to12, int mday, int offsetMinutes)
{
	struct tm tt = {};
	tt.tm_year = year - 1900;
	tt.tm_mon = month1to12 - 1;
	tt.tm_mday = mday;
	tt.tm_hour = 0;
	tt.tm_min = 0;
	tt.tm_sec = 0;
	tt.tm_isdst = -1;
#if defined(_WIN32)
	time_t secs = _mkgmtime(&tt);
#else
	time_t secs = timegm(&tt);
#endif
	return secs - static_cast<time_t>(offsetMinutes) * 60;
}

void rpLocalYmdFromUtc(time_t utc, int offsetMinutes, int& y, int& mon, int& d)
{
	time_t dayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(utc, offsetMinutes);
	time_t l = dayStartUtc + static_cast<time_t>(offsetMinutes) * 60;
	tm* tt = gmtime(&l);
	if (tt == nullptr) {
		y = 1970;
		mon = 1;
		d = 1;
		return;
	}
	y = tt->tm_year + 1900;
	mon = tt->tm_mon + 1;
	d = tt->tm_mday;
}

time_t getLocalRosterPeriodStartInUTC(time_t utc, int offsetMinutes)
{
	int y, mon, d;
	rpLocalYmdFromUtc(utc, offsetMinutes, y, mon, d);
	if (mon == 1 && d <= 30)
		return rpLocalYmdToUtcMidnight(y, 1, 1, offsetMinutes);
	if (mon == 1 && d == 31)
		return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
	if (mon == 2)
		return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
	if (mon == 3 && d == 1)
		return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
	if (mon == 3 && d >= 2)
		return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes);
	return Utility::GetInstancePtr()->getLocalMonthStartInUTC(utc, offsetMinutes);
}

time_t nextRosterPeriodStartUtc(time_t periodStartUtc, int offsetMinutes)
{
	int y, mon, d;
	rpLocalYmdFromUtc(periodStartUtc, offsetMinutes, y, mon, d);
	if (mon == 1 && d == 1)
		return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
	if (mon == 1 && d == 31)
		return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes);
	if (mon == 3 && d == 2)
		return rpLocalYmdToUtcMidnight(y, 4, 1, offsetMinutes);
	if (mon >= 4 && mon <= 11 && d == 1)
		return rpLocalYmdToUtcMidnight(y, mon + 1, 1, offsetMinutes);
	if (mon == 12 && d == 1)
		return rpLocalYmdToUtcMidnight(y + 1, 1, 1, offsetMinutes);
	return periodStartUtc;
}

time_t prevRosterPeriodStartUtc(time_t periodStartUtc, int offsetMinutes)
{
	int y, mon, d;
	rpLocalYmdFromUtc(periodStartUtc, offsetMinutes, y, mon, d);
	if (mon == 1 && d == 1)
		return rpLocalYmdToUtcMidnight(y - 1, 12, 1, offsetMinutes);
	if (mon == 1 && d == 31)
		return rpLocalYmdToUtcMidnight(y, 1, 1, offsetMinutes);
	if (mon == 3 && d == 2)
		return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
	if (mon == 4 && d == 1)
		return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes);
	if (mon >= 5 && mon <= 12 && d == 1)
		return rpLocalYmdToUtcMidnight(y, mon - 1, 1, offsetMinutes);
	return periodStartUtc;
}

time_t addRosterPeriods(time_t periodStartUtc, int offsetMinutes, int delta)
{
	time_t t = periodStartUtc;
	if (delta > 0) {
		for (int i = 0; i < delta; ++i)
			t = nextRosterPeriodStartUtc(t, offsetMinutes);
	}
	else if (delta < 0) {
		for (int i = 0; i < -delta; ++i)
			t = prevRosterPeriodStartUtc(t, offsetMinutes);
	}
	return t;
}

time_t endOfSingleRosterPeriod(time_t periodStartUtc, int offsetMinutes)
{
	int y, mon, d;
	rpLocalYmdFromUtc(periodStartUtc, offsetMinutes, y, mon, d);
	if (mon == 1 && d == 1)
		return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes) - 1;
	if (mon == 1 && d == 31)
		return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes) - 1;
	if (mon == 3 && d == 2)
		return Utility::GetInstancePtr()->getLocalMonthEndInUTC(periodStartUtc, offsetMinutes, 1);
	if (mon >= 4 && d == 1)
		return Utility::GetInstancePtr()->getLocalMonthEndInUTC(periodStartUtc, offsetMinutes, 1);
	return Utility::GetInstancePtr()->getLocalMonthEndInUTC(periodStartUtc, offsetMinutes, 1);
}

time_t getRosterPeriodMultiEndInUTC(time_t periodStartUtc, int offsetMinutes, int numPeriods)
{
	time_t cur = periodStartUtc;
	time_t end = endOfSingleRosterPeriod(cur, offsetMinutes);
	for (int i = 1; i < numPeriods; ++i) {
		cur = nextRosterPeriodStartUtc(cur, offsetMinutes);
		end = endOfSingleRosterPeriod(cur, offsetMinutes);
	}
	return end;
}

map<time_t, time_t> getRosterPeriodRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes, int times)
{
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalRosterPeriodStartInUTC(windowStart, offsetMinutes);
	while (tmTemp <= windowEnd) {
		time_t tmEnd = getRosterPeriodMultiEndInUTC(tmTemp, offsetMinutes, times);
		ranges.insert(pair<time_t, time_t>(tmTemp, tmEnd));
		tmTemp = nextRosterPeriodStartUtc(tmTemp, offsetMinutes);
	}
	return ranges;
}

map<time_t, time_t> getRosterPeriodRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, int offsetMinutes, int times, time_t refDate, bool /*isRolling*/)
{
	map<time_t, time_t> ranges;
	time_t tmTemp = getLocalRosterPeriodStartInUTC(refDate, offsetMinutes);
	time_t windowStartDay = getLocalRosterPeriodStartInUTC(windowStart, offsetMinutes);
	while (tmTemp <= windowEnd) {
		time_t tmEnd = getRosterPeriodMultiEndInUTC(tmTemp, offsetMinutes, times);
		if (tmEnd > windowStartDay)
			ranges.insert(pair<time_t, time_t>(tmTemp, tmEnd));
		tmTemp = tmEnd + 1;
	}
	return ranges;
}

} // namespace

int howManyDaysOffInRanges(const vector<SharedPtr<ROSTER>>& rosters, const SharedPtr<CrewDataContext>& dbData, const long long rulePhase, const vector<string>& doAssignments, const vector<string>& doAssignmentGroups, const time_t rangeStart, const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays, const bool bCountPostRest, const map<string, DBAirport*>& airportMap, const int requiredDays,
	time_t& lastRosterNotLaterThan, const vector<string> lastRosterAssignments, const string latoverTimemode = "", const int iConsecutive = 1, const bool bCountLayover = false, const string base = "", const vector<string> exceptionAssignment = std::vector<std::string>(), const bool isSplit = true, const string weekEnd = "N");

bool LegalityChecker::checkDaysOff(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkDaysOff");
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	bool rCountBlankDay = false, rPostRest = false, rCountLayover = false, rIsRolling = true;
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();

    rule8023 * ruleParam = (rule8023 *)singleRule->parsedParam.get();
    const string& rBase = ruleParam->rBase;
    const string& rRank = ruleParam->rRank;
    const string& rFleet = ruleParam->rFleet;
    const string& rTeam = ruleParam->rTeam;
    const string& rGroup = ruleParam->rGroup;
    const string& rMinDO = ruleParam->rMinDO;
    const string& rPeriod = ruleParam->rPeriod;
    const string& rUnit = ruleParam->rUnit;
    const string& rMonthNumber = ruleParam->rMonthNumber;
    const string& rLayoverTimemode = ruleParam->rLayoverTimemode;
    const string& rRefDate = ruleParam->rRefDate;
	const string& rRPDaysRange = ruleParam->rRPDaysRange;
    rPostRest = ruleParam->rPostRest;
    rCountBlankDay = ruleParam->rCountBlankDay;
    rCountLayover = ruleParam->rCountLayover;
    rIsRolling = ruleParam->rIsRolling;
	const string& rCheckType = ruleParam->rCheckType;
	string lastRosterLatestEndTime = ruleParam->rLastRosterLatestEndTime;
	vector<string> lastRosterAssignments = ruleParam->rLastRosterAssignments;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> groupList;
	split(rGroup, '|', groupList);
	vector<string> RPDaysRangeVec_str;
	split(rRPDaysRange, '-', RPDaysRangeVec_str);
	vector<string> daysOffs, restAssignments;
	vector<int> monthNumbers;
	split(rMonthNumber.c_str(), '|', monthNumbers);
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if (find(groupList.begin(), groupList.end(), (*assignment)->assignmentGroup) != groupList.end() && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			daysOffs.push_back((*assignment)->assignemnt);
		}
		if ((*assignment)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			restAssignments.push_back((*assignment)->assignemnt);
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() <= 0)
		return true;

	time_t rollingWindow_start, rollingWindow_end;
	if (this->GetApplication() != ROSTER_OPTIMIZER)
	{
		rollingWindow_start = rosters[0]->actStrUtc;
		rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
	}
	else
	{
		rollingWindow_start = this->_dbData->scenario.startDtUTC;
		rollingWindow_end = this->_dbData->scenario.endDtUTC;
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBase, rRank, rFleet, rTeam, "*", rollingWindow_start, rollingWindow_end))
		return true;

	int iMonths = stoi(rPeriod);
	int iRequiredDO = stoi(rMinDO);
	if (rosters.size() == 0)
		return true;
	time_t tempStart = rosters[0]->actEndUtc;

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	map<time_t, time_t> mp;
	if (rUnit == "CM")
	{
		if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {

			mp = Utility::GetInstancePtr()->getMonthRollingWindowsByRefDate(rollingWindow_start, rollingWindow_end + 24 * 3600, offsetMinutes, iMonths, utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
		}
		else {
			const auto& start = Utility::GetInstancePtr()->addMonths(rollingWindow_start, offsetMinutes, iMonths * -1 + 1);
			mp = Utility::GetInstancePtr()->getMonthRollingWindows(start, rollingWindow_end + 24 * 3600, offsetMinutes, iMonths);
		}
	}
	else if (rUnit == "CW")
	{
		if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {
			mp = Utility::GetInstancePtr()->getWeeksRollingWindowsByRefDate(rollingWindow_start - (iMonths * 7 - 1) * 24 * 3600, rollingWindow_end + (iMonths * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, iMonths, utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
		}
		else {
			mp = Utility::GetInstancePtr()->getWeeksRollingWindows(rollingWindow_start - (iMonths * 7 - 1) * 24 * 3600, rollingWindow_end + (iMonths * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, iMonths);
		}
	}
	else if (rUnit == "CD")
	{
		if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {
			mp = Utility::GetInstancePtr()->getDaysRollingWindowsByRefDate(rollingWindow_start - (iMonths - 1) * 24 * 3600, rollingWindow_end + (iMonths - 1) * 24 * 3600, offsetMinutes, iMonths, utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
		}
		else {
			mp = Utility::GetInstancePtr()->getDaysRollingWindows(rollingWindow_start - (iMonths - 1) * 24 * 3600, rollingWindow_end + (iMonths - 1) * 24 * 3600, offsetMinutes, iMonths);
		}
	}
	//0001926: 8023 UNIT新增BW選項
	else if (rUnit == "BW")
	{
		mp = Utility::GetInstancePtr()->getWeeksRollingWindowsByFirstDayOfYear(rollingWindow_start - (iMonths * 7 - 1) * 24 * 3600, rollingWindow_end + (iMonths * 7 - 1) * 24 * 3600, offsetMinutes, iMonths);
	}
	else if (rUnit == "RP")
	{
		//rollingWindow_start和rollingWindow_end是按照系统默认主基地计算的，组员基地和默认主基地所在时区可能不同，所以需要转换成组员基地的时间
		const string& systemDefaultAirport = this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
		const auto& zoneIdDefaultApt = this->_dbData->airportZoneIdMap[systemDefaultAirport];
		const auto& zoneIdCrewBase = this->_dbData->airportZoneIdMap[base];

		const auto offsetMinsDefaultApt_start = TimezoneUtils::GetTimezoneOffset(rollingWindow_start, zoneIdDefaultApt);
		const auto offsetMinsCrewBase_start = TimezoneUtils::GetTimezoneOffset(rollingWindow_start, zoneIdCrewBase);
		const auto diffOffset_start = offsetMinsDefaultApt_start - offsetMinsCrewBase_start;

		const auto offsetMinsDefaultApt_end = TimezoneUtils::GetTimezoneOffset(rollingWindow_end, zoneIdDefaultApt);
		const auto offsetMinsCrewBase_end = TimezoneUtils::GetTimezoneOffset(rollingWindow_end, zoneIdCrewBase);
		const auto diffOffset_end = offsetMinsDefaultApt_end - offsetMinsCrewBase_end;

		rollingWindow_start = rollingWindow_start + diffOffset_start * 60;
		rollingWindow_end = rollingWindow_end + diffOffset_end * 60;

		//按组员基地的起止时间，找到范围内所有的RP时间段
		if (!rIsRolling && !rRefDate.empty() && rRefDate != "*")
		{
			mp = getRosterPeriodRollingWindowsByRefDate(rollingWindow_start, rollingWindow_end + 24 * 3600, offsetMinutes, iMonths,
				utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
		}
		else
		{
			const auto& rpContainingStart = getLocalRosterPeriodStartInUTC(rollingWindow_start, offsetMinutes);
			const auto& start = addRosterPeriods(rpContainingStart, offsetMinutes, iMonths * -1 + 1);
			mp = getRosterPeriodRollingWindows(start, rollingWindow_end + 24 * 3600, offsetMinutes, iMonths);
		}
	}
	else
		return true;

	const auto& mandayFds = crew->mandayFdList;
	const auto& mandayCcAm = crew->mandayCcAmList;
	bool isFd = crew->division == "P";


	time_t start, end;
	int iDaysOff;
	for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it)
	{
		start = (*mp_it).first;
		end = (*mp_it).second;
		if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, rTeam, start, end))
			continue;
		if (this->_application == ROSTER_OPTIMIZER && (end < rollingWindow_start || start > rollingWindow_end))
			continue;

		if (rUnit == "CM" && rMonthNumber != "*" && !rMonthNumber.empty()) {
			const auto & mon = TimeUtils::GetMonth(start + offsetMinutes * 60) + 1;
			if (find(monthNumbers.begin(), monthNumbers.end(), mon) == monthNumbers.end())
				continue;
		}

		if (rUnit == "RP" && (int)RPDaysRangeVec_str.size() == 2)
		{
			const int daysRange_lower = atoi(RPDaysRangeVec_str[0].c_str());
			const int daysRange_upper = atoi(RPDaysRangeVec_str[1].c_str());
			const int numDaysInRP = static_cast<int>(std::ceil(static_cast<double>(end - start) / static_cast<double>(24 * 3600)));
			if (numDaysInRP < daysRange_lower || numDaysInRP > daysRange_upper)
				continue;
		}

		string tempBase = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, start);
		if (tempBase != base && tempBase.length() == 3)
		{
			auto tempOffsetMinutes = this->_dbData->getAirportOffsetMinutes(tempBase);
			if (tempOffsetMinutes != offsetMinutes)
			{
				start += (tempOffsetMinutes - offsetMinutes) * 60;
				end += (tempOffsetMinutes - offsetMinutes) * 60;
				offsetMinutes = tempOffsetMinutes;
			}
			base = tempBase;
		}
		vector<string> doAssignmentGroups;
		//if (!rCountBlankDay)
		//	iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
		//else
		//	//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, rPostRest, start, end);
		time_t lastRosterEndTime = 0;
		vector<string> exceptionAssignment = { "SNY", "DPW", "DPV" };
		iDaysOff = howManyDaysOffInRanges(rosters, this->_dbData, singleRule->phase, daysOffs, doAssignmentGroups, start, end, offsetMinutes, rCountBlankDay, rPostRest, this->_dbData->airportCodeMap, iRequiredDO, lastRosterEndTime, lastRosterAssignments, rLayoverTimemode, 1, rCountLayover, base, exceptionAssignment);

		//int onlyDayOffs = howManyDaysOffInRanges(rosters, this->_dbData, singleRule->phase, daysOffs, doAssignmentGroups, start, end, offsetMinutes, false, false, this->_dbData->airportCodeMap, iRequiredDO, lastRosterEndTime, rLayoverTimemode, 1, rCountLayover, base, "SNY");
		//int iOldDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offsetMinutes, rPostRest, start, end);
		//int dayOffAndBlankDay = howManyDaysOffInRanges(rosters, this->_dbData, singleRule->phase,daysOffs, doAssignmentGroups, start, end, offsetMinutes, rCountBlankDay, false, this->_dbData->airportCodeMap, iRequiredDO, lastRosterEndTime, rLayoverTimemode, 1, rCountLayover, base, "SNY");
		//int dayOffAndPostRest = howManyDaysOffInRanges(rosters, this->_dbData, singleRule->phase, daysOffs, doAssignmentGroups, start, end, offsetMinutes, false, rPostRest, this->_dbData->airportCodeMap, iRequiredDO, lastRosterEndTime, rLayoverTimemode, 1, rCountLayover, base, "SNY");
		//stringstream ss;
		//ss << "crew:" << crew->idCrew << ", ruleParamId:" << singleRule->idRuleParam  << " time period: " << start << "-" << end << ", iDaysOff:" << iDaysOff <<"("<< iOldDaysOff<<")(" << iRequiredDO << ")" << ", onlyDayOffs:" << onlyDayOffs << ", dayOffAndBlankDay:" << dayOffAndBlankDay << ", dayOffAndPostRest:" << dayOffAndPostRest << endl;
		//Logger::getRuleLogger()->debug("[8023] [1] {}", ss.str());

		if (rCheckType != "ROSTER") {
			time_t rostersStartDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->getStartTimeLocAct(), 0);
			time_t rostersEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->getRestStartLocAct(), 0) + 86400 - 1;
			if (!rPostRest)
				rostersEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->getEndTimeLocAct(), 0) + 86400 - 1;

			/*time_t scenarioStartDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(this->_dbData->scenario.startDtUTC, offsetMinutes);
			time_t scenarioEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(this->_dbData->scenario.endDtUTC, offsetMinutes) + 86400 - 1;
			rostersStartDay = rostersStartDay < scenarioStartDay ? rostersStartDay : scenarioStartDay;
			rostersEndDay = rostersEndDay > scenarioEndDay ? rostersEndDay : scenarioEndDay;*/
			//拼接manday, 防止因为界面打开范围造成的漏告警
			if (isFd) {
				for (size_t m = 0; m < mandayFds.size(); m++) {
					const auto& manday = mandayFds[m];

					if (!PhaseUtils::IsChecked(manday, singleRule->phase, this->_dbData)) {
						continue;
					}

					if ((manday->dateLoc >= start && manday->dateLoc < rostersStartDay) || (manday->dateLoc < end && manday->dateLoc > rostersEndDay)) {
						if (m != 0 && ((mandayFds[m - 1]->dateLoc >= start && mandayFds[m - 1]->dateLoc < rostersStartDay) || (mandayFds[m - 1]->dateLoc < end && mandayFds[m - 1]->dateLoc > rostersEndDay))) {
							if ((manday->dateLoc - mandayFds[m - 1]->dateLoc) / (86400) > 1 && !rCountBlankDay) {
								iDaysOff -= (manday->dateLoc - mandayFds[m - 1]->dateLoc) / 86400 - 1;
							}
						}
						if (manday->DAY_OFF == DAY_OFF_NOT_EXIST && rCountBlankDay)
							iDaysOff--;
					}
				}
			}
			else {
				for (size_t m = 0; m < mandayCcAm.size(); m++) {
					const auto& manday = mandayCcAm[m];
					
					if (!PhaseUtils::IsChecked(manday, singleRule->phase, this->_dbData)) {
						continue;
					}
					
					if ((manday->dateLoc >= start && manday->dateLoc < rostersStartDay) || (manday->dateLoc < end && manday->dateLoc > rostersEndDay)) {
						if (m != 0 && ((mandayCcAm[m - 1]->dateLoc >= start && mandayCcAm[m - 1]->dateLoc < rostersStartDay) || (mandayCcAm[m - 1]->dateLoc < end && mandayCcAm[m - 1]->dateLoc > rostersEndDay))) {
							if ((manday->dateLoc - mandayCcAm[m - 1]->dateLoc) / (86400) > 1 && !rCountBlankDay) {
								iDaysOff -= (manday->dateLoc - mandayCcAm[m - 1]->dateLoc) / 86400 - 1;
							}
						}
						if (manday->DAY_OFF == DAY_OFF_NOT_EXIST && rCountBlankDay)
							iDaysOff--;
					}
				}
			}
		}

		//stringstream ss2;
		//ss2 << "crew:" << crew->idCrew << ", ruleParamId:" << singleRule->idRuleParam << " time period: " << start << "-" << end << ", iDaysOff:" << iDaysOff << "(" << iRequiredDO << ")" << endl;
		//Logger::getRuleLogger()->debug("[8023] [2] {}", ss2.str());

		if (iDaysOff < iRequiredDO)
		{
			if (this->_application == ROSTER_OPTIMIZER)
			{
				if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, start, end - 1)))
					continue;
			}
			pCrew->isLegal = false;
			string msg = "The number of days off(" + Utility::GetInstancePtr()->ToString(iDaysOff) + ") must be at least " + rMinDO + " in " + rPeriod;
			msg += " " + rUnit + ".";
			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			pCrew->skipCheckInLaterIterations = true;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = (*roster)->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			// mantis#4923, start/end調整為TPE時區的00:00, 避免顯示不需要關注的區間
			auto sysBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]);
			start += ((offsetMinutes - sysBaseOffsetMinutes) * 60);
			end += ((offsetMinutes - sysBaseOffsetMinutes) * 60);
			rv->startDTUtc = start;
			rv->endDTUtc = end - 1;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
			rv->operation_result.insert(pair<string, string>("rMinDO", rMinDO));
			rv->operation_result.insert(pair<string, string>("rPeriod", rPeriod));
			rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}

		if (!lastRosterLatestEndTime.empty() && lastRosterLatestEndTime != "*" && iDaysOff == iRequiredDO) {
			const auto& lastRosterLatestEndTimeMin = hhmmStrToMinutes(lastRosterLatestEndTime);
			if (lastRosterEndTime % (86400) > lastRosterLatestEndTimeMin * 60) {
				if (this->_application == ROSTER_OPTIMIZER)
				{
					if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, start, end)))
						continue;
				}
				pCrew->isLegal = false;
				string msg = "The next roster is DO, the end time of the current roster must be earlier than " + lastRosterLatestEndTime;
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				// mantis#4923, start/end調整為TPE時區的00:00, 避免顯示不需要關注的區間
				auto sysBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]);
				start += ((offsetMinutes - sysBaseOffsetMinutes) * 60);
				end += ((offsetMinutes - sysBaseOffsetMinutes) * 60);
				rv->startDTUtc = start;
				rv->endDTUtc = end - 1;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}

		}
	}
	return bReturn;
}


int howManyDaysOffInRanges(const vector<SharedPtr<ROSTER>>& rosters, const SharedPtr<CrewDataContext>& dbData, const long long rulePhase, const vector<string>& doAssignments, const vector<string>& doAssignmentGroups, const time_t rangeStart, const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays, const bool bCountPostRest, const map<string, DBAirport*>& airportMap, const int requiredDays, time_t & lastRosterEndTime, const vector<string> lastRosterAssignments, const string layoverTimemode, const int iConsecutive, const bool bCountLayover, const string base, const vector<string> exceptionAssignment, const bool isSplit, const string weekEnd)
{
	if (iConsecutive < 1)
		return 0;

	//iConsecutive = 1;
	int iBlankDays = 0;

	int rosterSize = (int)rosters.size();

	map<time_t, WorkBlock> dailyAssignmentMap;

	time_t startTime = rangeStart + offsetMinutes * 60;
	while (startTime < rangeEnd) {
		dailyAssignmentMap.emplace(startTime, WorkBlock());
		startTime += 3600 * 24;
	}

	for (size_t i = 0; i < rosterSize; i++) {
		if (rosters[i]->actStrUtc > rangeEnd || (bCountPostRest && rosters[i]->actRestStrUtc < rangeStart) || (!bCountPostRest && rosters[i]->actEndUtc < rangeStart))
			continue;

		if (rosters[i] != nullptr && !PhaseUtils::IsChecked(rosters[i].get(), rulePhase, dbData)) {
			continue;
		}
		
		bool matchLastRosterAssignment = false;
		if (lastRosterAssignments.empty() || lastRosterAssignments[0] == "*" || find(lastRosterAssignments.begin(), lastRosterAssignments.end(), rosters[i]->qualifier) != lastRosterAssignments.end())
			matchLastRosterAssignment = true;

		int localOffsetMinutes = offsetMinutes;
		auto iterAirport = airportMap.find(rosters[i]->location);
		if (layoverTimemode.size() > 0 && layoverTimemode != "" && layoverTimemode == "LOCAL TIME" && iterAirport != airportMap.end()) {
			localOffsetMinutes = TimezoneUtils::GetTimezoneOffset(rosters[i]->actStrUtc, iterAirport->second->zoneId);
		}
		const auto& rosterStart = rosters[i]->actStrUtc;
		auto rosterEnd = (bCountPostRest ? rosters[i]->actRestStrUtc : rosters[i]->actEndUtc);

		//特殊处理，如果结束时间是00:00:00，则减1秒
		if ((rosterEnd + localOffsetMinutes * 60) % 86400 == 0) {
			--rosterEnd;
		}

		time_t dayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStart, localOffsetMinutes) + localOffsetMinutes * 60;
		time_t dayEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterEnd, localOffsetMinutes) + localOffsetMinutes * 60;

		int day = (int)(dayEnd - dayStart) / (3600 * 24) + 1;
		if (day <= 0) {
			continue;
		}
		for (size_t d = 0; d < day; d++) {
			time_t key = dayStart + d * (3600 * 24);
			if (dailyAssignmentMap.find(key) != dailyAssignmentMap.end()) {
				dailyAssignmentMap.at(key).assignments.push_back(rosters[i]->qualifier);
				dailyAssignmentMap.at(key).startTimeLoc = rosters[i]->getStartTimeLocAct();
				if (matchLastRosterAssignment) {
					dailyAssignmentMap.at(key).endTimeLoc = rosters[i]->getEndTimeLocAct();
					if (bCountPostRest)
						dailyAssignmentMap.at(key).endTimeLoc = rosters[i]->getRestStartLocAct();
				}

			}
		}
		if (rosters[i]->pairing && bCountLayover) {

			const auto& duties = rosters[i]->pairing->getDutyVec();
			for (size_t j = 0; j < duties.size() - 1; j++) {
				const auto& currentDuty = duties[j];
				const auto& nextDuty = duties[j + 1];

				const auto& dutyEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(currentDuty->getEndTimeUtcAct(), localOffsetMinutes) + localOffsetMinutes * 60;
				const auto& nextDutyStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(nextDuty->getStartTimeUtcAct(), localOffsetMinutes) + localOffsetMinutes * 60;

				if (dailyAssignmentMap.find(dutyEnd) != dailyAssignmentMap.end()) {
					dailyAssignmentMap.at(dutyEnd).endTimeLoc = currentDuty->getEndTimeLocAct();
				}

				//如果两个duty间有空白天
				if ((nextDutyStart - dutyEnd) / (3600 * 24) > 1) {
					const auto& layoverStart = dutyEnd + 3600 * 24;
					int layoverDay = (int)(nextDutyStart - layoverStart) / (3600 * 24);

					for (size_t d = 0; d < layoverDay; d++) {
						time_t key = layoverStart + d * 3600 * 24;
						if (dailyAssignmentMap.find(key) != dailyAssignmentMap.end()) {
							dailyAssignmentMap.at(key).assignments.clear();
							dailyAssignmentMap.at(key).assignments.push_back("LAYOVER");
							dailyAssignmentMap.at(key).isDo = true;
						}
					}
				}
			}

		}
	}

	for (auto& map : dailyAssignmentMap) {
		if (map.second.assignments.empty()) {
			if (bCountBlankDays) {
				iBlankDays++;
				map.second.isDo = true;
			}

			continue;
		}

		const auto& assignmentList = map.second.assignments;

		if (assignmentList.size() == 1) {
			if (find(doAssignments.begin(), doAssignments.end(), assignmentList[0]) != doAssignments.end() || assignmentList[0] == "LAYOVER")
				iBlankDays++;

			continue;
		}

		//特殊情况判断，如果有DO，又有SNY，也算作DO
		bool hasDO = false;
		bool hasExceptionAssignment = false;
		bool onlyDo = true;
		for (const auto& assignment : assignmentList) {
			if (find(doAssignments.begin(), doAssignments.end(), assignment) != doAssignments.end())
				hasDO = true;
			else {
				onlyDo = false;
			}
			if (!exceptionAssignment.empty() && find(exceptionAssignment.begin(), exceptionAssignment.end(), assignment) != exceptionAssignment.end())
				hasExceptionAssignment = true;
		}

		if (hasDO && (hasExceptionAssignment || onlyDo)) {
			iBlankDays++;
			map.second.isDo = true;
		}
	}


	if (!dailyAssignmentMap.empty()) {
		auto lastMap = --dailyAssignmentMap.end();
		if (lastMap->second.isDo) {
			for (auto iter = lastMap; iter != dailyAssignmentMap.begin(); iter--) {
				if (!iter->second.isDo) {
					lastRosterEndTime = iter->second.endTimeLoc;
					break;
				}

			}
		}
	}


	return (iBlankDays);
}

//int howManyAssignmentsInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string>& assignments, time_t rangeStart, time_t rangeEnd)
//{
//	int iDaysOff = 0;
//	bool bCountPostRest = false;
//	std::size_t iSize = rosters.size();
//	time_t start, end, next_end;
//
//	for (std::size_t i = 0; i < iSize; i++)
//	{
//		if (bCountPostRest)
//			end = rosters[i]->actRestStrUtc;
//		else
//			end = rosters[i]->actEndUtc;
//		start = rosters[i]->actStrUtc;
//		if (!(start >= rangeStart && end <= rangeEnd))
//			continue;
//		if (find(assignments.begin(), assignments.end(), rosters[i]->qualifier) != assignments.end())
//		{
//			if (iConsecutive > 1)
//			{
//				bool bFind = false;
//				for (int j = 0; j < iConsecutive; j++)
//				{
//					if (!bFind)
//					{
//						if (bCountPostRest)
//							end = rosters[i + j + 1]->actRestStrUtc;
//						else
//							end = rosters[i + j + 1]->actEndUtc;
//						start = rosters[i + j + 1]->actStrUtc;
//						if (!(start >= rangeStart && end <= rangeEnd))
//						{
//							bFind = true;
//							continue;
//						}
//						if (matchAssignmentInRoster(rosters[i + j + 1], assignments, assignmentGroups))
//						{
//							bFind = true;
//						}
//
//					}
//				}
//				if (!bFind)
//					iDaysOff++;
//			}
//			else
//				iDaysOff++;
//		}
//	}
//
//	return iDaysOff;
//}
