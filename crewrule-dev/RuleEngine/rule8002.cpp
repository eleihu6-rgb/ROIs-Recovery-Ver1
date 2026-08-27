

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/PhaseUtils.h"

using namespace std;

const static double ZERO_EPSILON = 0.000001;

bool cmpp1(SharedPtr<CREW_MANDAY_FD> m1, SharedPtr<CREW_MANDAY_FD> m2)  {
	return m1->crewDateUtc < m2->crewDateUtc;
}
bool cmpp2(SharedPtr<CREW_MANDAY_CC_AM> m1, SharedPtr<CREW_MANDAY_CC_AM> m2)  {
	return m1->crewDateUtc < m2->crewDateUtc;
}

/*
Block:
MAX_LIMIT,PERIOD,PRD_DESC,USEPRORATED,CHECK_LAST_DAY
40		 , 7	,CD		 ,N			 ,0

FDP:
MAX_LIMIT,PERIOD,PRD_DESC,USEPRORATED,CHECK_LAST_DAY
70,7,RD,N,0
//这里需要考虑RO情形（没有Man day数据，需要根据新ASSIGNMENT计算Man Day）
*/
bool LegalityChecker::checkMaxCummulative(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMaxCummulative");

	bool isValid = true;

	rule8002* ruleParam = (rule8002*)singleRule->parsedParam.get();
	const string& strBase = ruleParam->strBase;
	const string& strRank = ruleParam->strRank;
	const string& strFleet = ruleParam->strFleet;
	const string& strTeams = ruleParam->strTeams;
	string strPeriod = ruleParam->strPeriod;
	string strPrdDesc = ruleParam->strPrdDesc;
	const string& strProrated = ruleParam->strProrated;
	string strMax = ruleParam->strMax;
	string strMin = ruleParam->strMin;
	string strType = ruleParam->strType;
	int iMin = ruleParam->iMin;
	int iMax = ruleParam->iMax;

	const string& intOperBLH = ruleParam->intOperationBLH;
	int intOperBLHLower = ruleParam->intOperationBLHMinutesLower;
	int intOperBLHUpper = ruleParam->intOperationBLHMinutesUpper;

	const string& augOperBLH = ruleParam->augOperationBLH;
	int augOperBLHLower = ruleParam->augOperationBLHMinutesLower;
	int augOperBLHUpper = ruleParam->augOperationBLHMinutesUpper;

	const string& dutyAloftTime = ruleParam->dutyAloftTime;
	int dutyAloftTimeLower = ruleParam->dutyAloftTimeMinutesLower;
	int dutyAloftTimeUpper = ruleParam->dutyAloftTimeMinutesUpper;

    const auto& hasSBYorFLY = ruleParam->hasSBYorFLY;

	const auto& reductionPerDuty = ruleParam->reductionPerDuty;
	const int reductionMinutesPerDuty = ruleParam->reductionMinutesPerDuty;

	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	transform(strType.begin(), strType.end(), strType.begin(), ::toupper);

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER || this->_application == ROSTER_EDITOR)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeams, "*", lCheckedStart, lCheckedEnd))
		return true;

	map<time_t, time_t>::iterator iter_date;

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };

	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
	vector<SharedPtr<CREW_BASE>>&  bases = crew->baseList;

	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	const map<time_t, int>& crewAdjustPerdiemIndex = crew->crewKpiAdjustTimeIndex->getPerdiemIndex();
	const map<time_t, int>& crewAdjustCreditIndex = crew->crewKpiAdjustTimeIndex->getCreditIndex();
	
	if (ranks.size() < 1 && strRank != "*")
		return true;
	bool isFd = (crew->division == "P");

	string base = crew->getPrimeBase();
	//OP1489, EVA only use TPE base regardless crew base
	if (base == "" || this->_dbData->scenario.airline == "BR")
		base = "TPE";

	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	if (isFd)
		stable_sort(cfd.begin(), cfd.end(), cmpp1);
	else
		stable_sort(cabin.begin(), cabin.end(), cmpp2);

	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strPrdDesc, strPeriod, lCheckedStart, lCheckedEnd, weekdayStartFrom, offsetMinutes);

	//2023/12/11 8002支持Alliance的RP概念定义
	if (strPrdDesc == "RP")
	{
		mpRange.clear();
		for (auto& rp : this->_dbData->rosterPeriodList)
		{
			if (Utility::GetInstancePtr()->isTimeOverlap(rp.rp_start, rp.rp_end, lCheckedStart, lCheckedEnd))
			{
				int iNum = stoi(strPeriod);
				//假设为基地本地时
				time_t start = rp.rp_start;
				//假设结束日期为当日23:59
				time_t end = rp.rp_end + 24 * 60 * 60;
				//转换成Crew基地本地时间开始、结束日期，offsetMinutes
				start = start - offsetMinutes * 60 - (iNum - 1) * 28 * 24 * 60 * 60;
				end = end - offsetMinutes * 60;
				mpRange.insert(pair<time_t, time_t>(start, end));
			}
		}
	}

	//2025/09/03 8002新增YTM类型，指从当年1.1到几月底，period是具体几月
	if (strPrdDesc == "YTM")
	{
		mpRange.clear();
		int month = stoi(strPeriod);
		const auto& startYear = Utility::GetInstancePtr()->getLocalYearStartInUTC(lCheckedStart, offsetMinutes);

		time_t endMonth = TimeUtils::getEndOfMonth(startYear, month);

		if (endMonth > this->_dbData->scenario.endDtUTC + offsetMinutes * 60)
			return true;

		mpRange.insert(pair<time_t, time_t>(startYear, TimeUtils::getEndOfMonth(startYear, month)));

		if (!Utility::GetInstancePtr()->isSameYear(lCheckedStart, lCheckedEnd)) {
			const auto& endYear = Utility::GetInstancePtr()->getLocalYearStartInUTC(lCheckedEnd, offsetMinutes);
			mpRange.insert(pair<time_t, time_t>(endYear, Utility::GetInstancePtr()->addMonths(endYear, month) - 1));
		}
	}

	time_t trackEnd = Utility::GetInstancePtr()->getTrackingWindowEnd(offsetMinutes);

	for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
	{
		if (this->_application == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0)
		{
			if (!(Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, rosters[pCrew->RosterIndex]->actStrUtc, rosters[pCrew->RosterIndex]->actRestStrUtc))) {
				continue;
			}
		}

		//OP1489
		//0003271: [8002] SCENARIO 环境测试反馈
		/*
		Tracking Window目前属于EVA逻辑，暂时对其他客户和RO应用屏蔽
		*/
		//if (this->_application != ROSTER_OPTIMIZER && this->_dbData->scenario.airline == "BR")
		//{
		//	if ((singleRule->phase == PHASE::PHASE_ASSIGNMENT || singleRule->phase == PHASE::PHASE_PLANNING) && (iter_date->second + 24 * 3600 <= trackEnd))
		//		continue;
		//	if ((singleRule->phase == PHASE::PHASE_TRACKING) && (iter_date->first > trackEnd))
		//		continue;
		//}

		//0002650: LIVE 8002出现打开区间外的告警
		if (!(Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, lCheckedStart, lCheckedEnd)))
			continue;

		if (strTeams!="*")
			if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, strTeams, (*iter_date).first, (*iter_date).second))
				continue;

		double iCumFDP = 0, iCumBlh = 0, iCumFt = 0, iCumDP = 0, iCumCustDP = 0, iWp = 0, iExtendWp = 0, iCredit = 0, iPerDiem = 0, cumAugBlh = 0, cumIntBlh = 0, radiationDose = 0;
		int  iAdjustCredit = 0, iAdjustPerDiem = 0;
		double iCumTGFt = 0;//TG专用，存储在custData1
		double cumCEBUDutyAlotTime = 0;//CEBU专用，存储在custData1

		bool checkDPNonRBPNC = true;
		double iSbyDP = 0, iPncDP = 0;
        int iCrossTzDutyCount = 0;//HX专用, 满足跨6个时区条件的Duty数量，来自manday.crossTzDutyCount
		if (isFd)
		{
			for (size_t j = 0; j < cfd.size(); j++)
			{
				if (!PhaseUtils::IsChecked(cfd[j], singleRule->phase, this->_dbData)) {
					continue;
				}

				//20180606 ain, mantis#3429, mpRange结束时间对比补齐 utc修正
				if (cfd[j]->crewDateUtc >= iter_date->first && cfd[j]->crewDateUtc <= iter_date->second )
				{
					iCumFDP += cfd[j]->fdp;
					iCumBlh += cfd[j]->blh;
					iCumFt += cfd[j]->ft;
					iCumDP += cfd[j]->dp;
					iCumCustDP += cfd[j]->cust_dp;
					iWp += cfd[j]->normal_wp;
					iExtendWp += cfd[j]->extend_wp;
					iCumTGFt += cfd[j]->custData1;
					cumCEBUDutyAlotTime += cfd[j]->custData1;
					iCredit += cfd[j]->credit;
					iPerDiem += cfd[j]->PER_DIEM;
					iSbyDP += cfd[j]->SBY_DP;
					iPncDP += cfd[j]->DHD_DP;
					cumAugBlh += cfd[j]->augBlh;
					cumIntBlh += cfd[j]->intBlh;
					radiationDose += cfd[j]->radiationDose;
					iCrossTzDutyCount += cfd[j]->crossTzDutyCount;

					auto iterAdjustPerdiem = crewAdjustPerdiemIndex.find(cfd[j]->dateLoc);
					if (iterAdjustPerdiem != crewAdjustPerdiemIndex.end()) {
						iAdjustPerDiem += iterAdjustPerdiem->second;
					}

					auto iterAdjustCredit = crewAdjustCreditIndex.find(cfd[j]->dateLoc);
					if (iterAdjustCredit != crewAdjustCreditIndex.end()) {
						iAdjustCredit += iterAdjustCredit->second;
					}
					if (cfd[j]->STANDBY || cfd[j]->IS_POSITION)
						checkDPNonRBPNC = false;
				}
			}
		}
		else
		{
			for (size_t j = 0; j < cabin.size(); j++)
			{
				if (!PhaseUtils::IsChecked(cabin[j], singleRule->phase, this->_dbData)) {
					continue;
				}

				//20180606 ain, mantis#3429, mpRange结束时间对比补齐 utc修正
				if (cabin[j]->crewDateUtc >= iter_date->first && cabin[j]->crewDateUtc <= iter_date->second)
				{
					iCumFDP += cabin[j]->fdp;
					iCumBlh += cabin[j]->blh;
					iCumFt += cabin[j]->ft;
					iCumDP += cabin[j]->dp;
					iCumCustDP += cabin[j]->cust_dp;
					iWp += cabin[j]->normal_wp;
					iExtendWp += cabin[j]->extend_wp;
					iCumTGFt += cabin[j]->custData1;
					cumCEBUDutyAlotTime += cabin[j]->custData1;
					iCredit += cabin[j]->credit;
					iPerDiem += cabin[j]->PER_DIEM;
					iSbyDP += cabin[j]->SBY_DP;
					iPncDP += cabin[j]->DHD_DP;
					cumAugBlh += cabin[j]->augBlh;
					cumIntBlh += cabin[j]->intBlh;
					radiationDose += cabin[j]->radiationDose;
					iCrossTzDutyCount += cabin[j]->crossTzDutyCount;

					auto iterAdjustPerdiem = crewAdjustPerdiemIndex.find(cabin[j]->dateLoc);
					if (iterAdjustPerdiem != crewAdjustPerdiemIndex.end()) {
						iAdjustPerDiem += iterAdjustPerdiem->second;
					}

					auto iterAdjustCredit = crewAdjustCreditIndex.find(cabin[j]->dateLoc);
					if (iterAdjustCredit != crewAdjustCreditIndex.end()) {
						iAdjustCredit += iterAdjustCredit->second;
					}

					if (cabin[j]->cust_dp > cabin[j]->dp && this->_dbData->scenario.airline == "BR")
						printf("Exception: Cust DP > DP. %s %s %d %d %d/%d\n", cabin[j]->idCrew.c_str(), utcToUtcString(cabin[j]->crewDateUtc).c_str(),
						cabin[j]->blh, cabin[j]->fdp, cabin[j]->dp, cabin[j]->cust_dp);
				}
			}
		}

        //匹配过滤参数hasSBYorFLY，判断周期内是否有SBY或FLY任务
		if (hasSBYorFLY != nullptr) {
			if (*hasSBYorFLY) {
				if (iSbyDP <= ZERO_EPSILON && iCumBlh <= ZERO_EPSILON) {
                    //hasSBYorFLY==true, 周期内没有SBY任务和飞行任务，跳过检查
					continue;
				}
			}
			else {
				if (iSbyDP > ZERO_EPSILON || iCumBlh > ZERO_EPSILON) {
                    //hasSBYorFLY==false, 周期内有SBY任务或飞行任务，跳过检查
					continue;
				}
			}
		}

		// mantis#5058, range的start/end已經是加上offset的時間
		//utcToUtcStr(iter_date->first + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
		//utcToUtcStr(iter_date->second + offsetMinutes * 60, endUtcStr, sizeof(endUtcStr));
		utcToUtcDtStr(iter_date->first + (time_t)offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
		utcToUtcDtStr(iter_date->second + (time_t)offsetMinutes * 60, endUtcStr, sizeof(endUtcStr));

		if (strType == "WP")
		{
			if (((int)iWp > iMax) || ((int)iWp < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iWp);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative normal working period ({2:iWp}) exceeds the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or is less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);
			}
		}

		if (strType == "TOTAL WP")
		{
			if ((((int)(iWp + iExtendWp)) > iMax) || (((int)(iWp + iExtendWp)) < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)(iWp + iExtendWp));

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative total working period ({2:iWpAddiExtendWp}) exceeds the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or is less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				//SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(crew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		//if (singleRule->function == RULES::MAX_CUM_BLOCK)
		if (strType == "BH")
		{
			if (intOperBLH != "*"
				&& (intOperBLHLower != 0 || intOperBLHUpper != 0 || (int)cumIntBlh != 0)
				&& (intOperBLHLower > (int)cumIntBlh || intOperBLHUpper <= (int)cumIntBlh)) {
				continue;
			}

			if (augOperBLH != "*"
				&& (augOperBLHLower != 0 || augOperBLHUpper != 0 || (int)cumAugBlh != 0)
				&& (augOperBLHLower > (int)cumAugBlh || augOperBLHUpper <= (int)cumAugBlh)) {
				continue;
			}

			if (dutyAloftTime != "*"
				&& (dutyAloftTimeLower != 0 || dutyAloftTimeUpper != 0 || (int)cumCEBUDutyAlotTime != 0)
				&& (dutyAloftTimeLower > (int)cumCEBUDutyAlotTime || dutyAloftTimeUpper <= (int)cumCEBUDutyAlotTime)) {
				continue;
			}

			if (((int)iCumBlh > iMax) || ((int)iCumBlh < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iCumBlh);

				//string ruleid = boost::lexical_cast<string>(singleRule->idRule);
				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative block hours ({2:iCumBlh}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		if (strType == "DP")
		{
			int totalReductionMinutes = 0;
            if (!reductionPerDuty.empty() && reductionPerDuty != "*")
			{
				totalReductionMinutes = (iCrossTzDutyCount * reductionMinutesPerDuty);
			}
			iCumDP -= totalReductionMinutes;
			if (iCumDP < 0) iCumDP = 0;
			if (((int)iCumDP > iMax) || ((int)iCumDP < iMin && this->_application != ROSTER_OPTIMIZER))
			{
					/*if (this->_dbData->scenario.airline == "BR" && checkDPNonRBPNC)
						continue;*/
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;

				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iCumDP);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative duty periods ({2:iCumDP}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				if (totalReductionMinutes != 0) {
					message += " (06:00+ Time Zone Duty Number:" + std::to_string(iCrossTzDutyCount) + ")";
                }
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("crossTzDutyCount", std::to_string(iCrossTzDutyCount)));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);
			}
		}

		if (strType == "FT")
		{
			if (((int)iCumFt > iMax) || ((int)iCumFt < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iCumFt);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative flight times ({2:iCumFt}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		// only for TG phase 1
		if (strType == "PFT")
		{
			if (((int)iCumTGFt > iMax) || ((int)iCumTGFt < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iCumTGFt);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative proportional flight times ({2:iCumTGFt}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		//if (singleRule->function == RULES::MAX_CUM_FDP)
		if (strType == "FDP")
		{
			if (((int)iCumFDP > iMax) || ((int)iCumFDP < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iCumFDP);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative flight duty periods ({2:iCumFDP}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		if (strType == "DP-NON-RB-PNC")
		{
			if (!checkDPNonRBPNC)
				continue;
			if ( checkDPNonRBPNC && (int)iCumDP > iMax)
			{
				
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iCumCustDP);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative DP-NON-RB-PNC ({2:iCumCustDP}), exceeds the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		if (strType == "CH")//Credit Hour
		{
			int totalCredit = (int)std::ceil(iCredit + iAdjustCredit);
			if ((totalCredit > iMax) || (totalCredit < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes(totalCredit);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative credit hours({2:iCredit}), exceeds the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}

		if (strType == "PH")//Per Diem Hour
		{
			if ((((int)iPerDiem + iAdjustPerDiem) > iMax) || (((int)iPerDiem + iAdjustPerDiem) < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes((int)iPerDiem + iAdjustPerDiem);
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative per-diem hours({2:iPerdiem}), exceeds the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}
		if (strType == "DP-SBY-PNC")
		{
			if (((int)(iSbyDP + iPncDP) > iMax) || ((int)(iSbyDP + iPncDP) < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes(static_cast<int>(iSbyDP + iPncDP));
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual SBY + PNC duty periods ({2:iSbyPnc}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}
		if (strType == "DP-WITHOUT-SBY-PNC")
		{
			const auto& iNum = (int)(iCumDP - iSbyDP - iPncDP);
			if ((iNum > iMax) || (iNum < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				string temp = Utility::GetInstancePtr()->formatMinutes(static_cast<int>(iNum));
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual duty periods without SBY+PNC({2:iSbyPnc}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);

			}
		}
		if (strType == "COSMIC")
		{
			if (radiationDose > iMax || (radiationDose < iMin && this->_application != ROSTER_OPTIMIZER))
			{
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);
				string temp = StringUtils::dtos(radiationDose);
				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual radiation dose({2:temp}) exceed the maximum ([{3:strPeriod}, {4:strPrdDesc}] {5:strMax}) or are less than the minimum ({6:strMin}).";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strPeriod, strPrdDesc, strMax, strMin);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);
			}
		}
	}

	return isValid;
}
