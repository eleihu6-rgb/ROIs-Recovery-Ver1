
#include "basicCalculation.h"
#include "UtilDbg.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "RuleStatistics.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleEngine.h"
#include "utils/AssignmentUtils.h"
#include "utils/SegmentUtils.h"
#include "utils/DutyUtils.h"
#include "utils/SchDutyUtils.h"
#include "utils/RosterUtils.h"
#include "utils/NumberUtils.h"
#include <algorithm>
#include <math.h>
#include "TimezoneUtils.h"
#include "../constant/Constants.h"
#include "utils/TimeUtils.h"
#include "../rule7401/AnrDayOffDefinition.h"

const int MAX_TRANSIT_WP = 60 * 60;
int countDutyInRoster(shared_ptr<ROSTER>& roster, CrewDataContext* dbData);

namespace {
	time_t GetPrevRosterDPStartForHX(const ROSTER* roster) {
		if (roster->pairing) {
			auto duty = roster->pairing->getLastDuty();
			if (duty) {
				return duty->getStartTimeUtcAct();
			}
		}
		return roster->getStartTimeUtcAct();
	}

	int GetRosterLocalOffsetMinutesForHX(const ROSTER* roster) {
		if (roster == nullptr || roster->actStrUtc == 0) {
			return 0;
		}
		return static_cast<int>((roster->actStrLoc - roster->actStrUtc) / 60);
	}

	long GetWindowOverlapSecondsForHX(time_t startUtc, time_t endUtc, const ROSTER* roster, const Standby_DP_Definition& definition) {
		if (endUtc <= startUtc) {
			return 0;
		}
		if (definition.sbyWindow.empty() || definition.sbyWindow == "*") {
			return static_cast<long>(endUtc - startUtc);
		}

		const int offsetMinutes = GetRosterLocalOffsetMinutesForHX(roster);
		const time_t startLoc = startUtc + offsetMinutes * 60;
		const time_t endLoc = endUtc + offsetMinutes * 60;
		const time_t daySeconds = 24 * 60 * 60;
		const time_t firstDayStart = (startLoc / daySeconds) * daySeconds - daySeconds;
		long overlapSeconds = 0;

		auto addOverlap = [&](time_t windowStart, time_t windowEnd) {
			const time_t overlapStart = max(startLoc, windowStart);
			const time_t overlapEnd = min(endLoc, windowEnd);
			if (overlapEnd > overlapStart) {
				overlapSeconds += static_cast<long>(overlapEnd - overlapStart);
			}
		};

		for (time_t dayStart = firstDayStart; dayStart < endLoc; dayStart += daySeconds) {
			const time_t windowStart = dayStart + definition.sbyWindowStart * 60;
			const time_t windowEnd = dayStart + definition.sbyWindowEnd * 60;
			if (definition.sbyWindowEnd >= definition.sbyWindowStart) {
				addOverlap(windowStart, windowEnd);
			}
			else {
				addOverlap(windowStart, dayStart + daySeconds);
				addOverlap(dayStart, windowEnd);
			}
		}
		return overlapSeconds;
	}

	int ApplyStandbyDPDefinitionForHX(const SharedPtr<ROSTER>& roster, time_t dpStartUtc, time_t dpEndUtc, int dpMinutes) {
		if (dpMinutes <= 0) {
			return dpMinutes;
		}

		auto& standbyDPDefinitions = RuleParams::GetInstancePtr()->getStandbyDPDefinitions();
		for (auto& standbyDPDefinition : standbyDPDefinitions) {
			if (!standbyDPDefinition->match(roster.get())) {
				continue;
			}

			const long totalSeconds = static_cast<long>(dpEndUtc - dpStartUtc);
			const long overlapSeconds = GetWindowOverlapSecondsForHX(dpStartUtc, dpEndUtc, roster.get(), *standbyDPDefinition);
			const long nonOverlapSeconds = max(0L, totalSeconds - overlapSeconds);
			const double adjustedMinutes = nonOverlapSeconds / 60.0 + (overlapSeconds / 60.0) * standbyDPDefinition->sbyDPRatioValue;
			return NumberUtils::Ceil(adjustedMinutes);
		}

		return dpMinutes;
	}

	void SetRosterDPForHX(const SharedPtr<ROSTER>& roster, int dpMinutes) {
		if (roster->pairing) {
			const auto dutyCount = roster->pairing->getDutyVec().size();
			if (dutyCount == 0) {
				return;
			}
			const int dutyIndex = static_cast<int>(dutyCount - 1);
			auto duty = roster->pairing->getLastDuty();
			if (duty) {
				duty->setActualDP(dpMinutes);
			}
			roster->dutyValues.setActDp(dutyIndex, dpMinutes);
		}
		else {
			roster->dutyValues.setActDp(0, dpMinutes);
		}
		roster->dpMinutes = dpMinutes;
	}

	bool IsFlightCountedForMandayBlh(const CrewDataContext* dbData, const Segment* segment) {
		if (dbData == nullptr || segment == nullptr) {
			return true;
		}
		return !(dbData->getSystemParamValue("IS_FLIGHT_RTR_CALC_BLH", "Y") == "N"
			&& segment->getFltSts() == "RTR");
	}
}

/*
计算CALLIN STANDBY和CALLIN ROSTER重叠部分，计入FDP，设置到CALLIN ROSTER，给后续法规检查使用
*/
void calcualteCallinSbyFDP(SharedPtr<CrewDataContext> data, SharedPtr<CREW> crew, vector<string>* standbyAssignments)
{
	//EVA无抓飞业务，当航司是EVA BR时，则退出 或者 配置SUPPORT_CALLOUT（支持抓飞）为 N 时，则退出
	if (data->scenario.airline == "BR" || data->getSystemParamValue("SUPPORT_CALLOUT", "Y") != "Y") {
		return;
	}

	if (crew->rosterList.size() < 2)
		return;

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	for (int i = 0; i < (int)rosters.size() - 1; ++i)
	{
		rosters[i + 1]->callinSBY_FDPMins = 0;
		
		//仅需要判断Roster的Assignment(rosters.qualifier)是否在standbyAssignments即可, 这里同时判断AssignmentGroup(rosters.duty)为保证老配置的兼容性
		if (rosters[i]->callOutRosterId == 0 && std::find(standbyAssignments->begin(), standbyAssignments->end(), rosters[i]->duty) == standbyAssignments->end()
			&& std::find(standbyAssignments->begin(), standbyAssignments->end(), rosters[i]->qualifier) == standbyAssignments->end())
			continue;
		if (rosters[i + 1]->duty != "FLY" || !(rosters[i + 1]->pairing))
			continue;
		//if (!(data->isAssignmentInGroup(rosters[i]->qualifier, "CSB")))
		//	continue;
		if (rosters[i]->actStrUtc < rosters[i + 1]->actStrUtc && rosters[i]->actRestStrUtc >= rosters[i + 1]->actStrUtc)
		{
			rosters[i + 1]->callinSBY_FDPMins = static_cast<long>(rosters[i + 1]->actStrUtc - rosters[i]->actStrUtc) / 60;
		}
	}

}

//20180116 ain, DO/SBY/LEA/GND部分逻辑封装
void calOneDayDoSbyLeaGnd(SharedPtr<CrewDataContext>& data, SharedPtr<CREW_MANDAY_BASIC>& temp, string rosterType, string qualifier) {

	if (rosterType == "EXT") {

	}
	bool isSby = data->isAssignmentInGroup(rosterType, "SBY");
	if (data->isAssignmentInGroup(rosterType, "DO")) {
		temp->DAY_OFF = DAY_OFF_EXIST;
	}
	else if (isSby) {
		temp->STANDBY = 1;
	}
	else if (data->isAssignmentInGroup(rosterType, "LEA")) {
		temp->LEAVE = 1;
	}
	else if (data->isAssignmentInGroup(rosterType, "GND")) {
		temp->GND = 1;
	}
	else
	{
	}
	//20180116 ain, OP#1583, manday.HSB/CSB/ASB for BR
	if (data->scenario.airline == "BR" && isSby) {
		if (data->isAssignmentInGroup(qualifier, "CSB")) {
			temp->CSB = 1;
		}
		if (data->isAssignmentInGroup(qualifier, "ASB")) { temp->ASB = 1; }
		if (data->isAssignmentInGroup(qualifier, "HSB")) { temp->HSB = 1; }
	}
}

//20180116 ain, FLY DP
void calOneDayDpForNoneFly(SharedPtr<CrewDataContext>& data, SharedPtr<CREW_MANDAY_BASIC>& temp, SharedPtr<ROSTER>& roster, time_t DayStart, time_t DayEnd) {

	long dp = 0;
	if (roster->pairing)
	{
		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty * duty = roster->pairing->getDuty(di);
			if (min(duty->getEndTimeUtcAct(), DayEnd) > max(duty->getStartTimeUtcAct(), DayStart))
				dp += (long)round((min(duty->getEndTimeUtcAct(), DayEnd) - max(duty->getStartTimeUtcAct(), DayStart)) / 60.0);
		}
	}
	else
	{
		if (min(roster->actRestStrUtc, DayEnd) > max(roster->actStrUtc, DayStart))
			dp = (long)round((min(roster->actRestStrUtc, DayEnd) - max(roster->actStrUtc, DayStart)) / 60.0);
	}
	//mantis#2155
	if (data->assignmentNameMap.find(roster->duty) != data->assignmentNameMap.end()) {
		SharedPtr<ASSIGNMENT> assignment = data->assignmentNameMap[roster->duty];
		temp->dp = (int)(dp*assignment->DP_PCT);
		temp->cust_dp = temp->dp;
		if (roster->duty == "RB")
			temp->cust_dp = 0;
	}
	else {
		temp->dp = dp;
		temp->cust_dp = dp;
	}
}

void calOneDayPerdiem(SharedPtr<CREW>& crew, SharedPtr<CREW_MANDAY_BASIC>& temp, SharedPtr<ROSTER>& roster, Pairing* pairing, time_t DayStart, time_t DayEnd, int iPerDiem, bool isInSameCity, bool isHalf, bool bFoundAnotherHalf) {
	time_t start = roster->actStrUtc;
	time_t end = roster->actRestStrUtc;
	if (crew && !temp->GND && start < DayEnd && end > DayStart)
	{
		//mantis#2320, 只在目标roster日期区间计算per diem
		bool isTargetPeriod = false;
		if (roster.get()) {
			if (DayStart <= roster->endUtc && DayEnd > roster->endUtc)
				isTargetPeriod = true;
		}
		else if (pairing) {
			if (DayStart <= pairing->getEndTimeUtc() && DayEnd > pairing->getEndTimeUtc())
				isTargetPeriod = true;
		}
		if (isTargetPeriod) {
			if (isInSameCity && !isHalf)
				temp->PER_DIEM = (int)round(iPerDiem * ((min(DayEnd, end) - max(DayStart, start)) / (end - start)));
			else if (!isInSameCity && isHalf && bFoundAnotherHalf)
				temp->PER_DIEM = (int)round((min(DayEnd, end) - max(DayStart, start)) / (60.0));
		}
	}
}

/*
void calOneDayDpFdpFtForFly
(
SharedPtr<CrewDataContext>& data,
SharedPtr<CREW_MANDAY_BASIC>& temp,
SharedPtr<ROSTER>& _roster,
time_t DayStart,
time_t DayEnd,
bool isDebug,
int iFDPMode) {

	int       ft = 0;
	int       blh = 0;
	int       fdp = 0;
	int       dp = 0;
	time_t duty_start = 0, duty_end = 0;
	bool hasPNC = false;
	time_t cust_start, cust_end;
	for (std::size_t di = 0; di < _roster->pairing->getNumDuties(); di++)
	{
		Duty * duty = _roster->pairing->getDuty(di);
		Duty::DUTY_TYPE dt = duty->getType();
		if (dt == Duty::DUTY_PAIRING_REST || dt == Duty::DUTY_BLANK_DAY)
		{
			continue;
		}

		if ((dt == Duty::MAX_DUTY_PLC_TYPES) && (isDebug)){
			//printf("max duty plc types\n");
		}
		duty_start = duty->getStartTimeUtcAct();
		duty_end = duty->getEndTimeUtcAct();
		//dbg = "loop duty_start>";
		if ((duty_start > DayStart && duty_start < DayEnd) || (duty_end > DayStart && duty_end < DayEnd))
		{
			//vector<Segment *> seglist = (*dutyIter)->getSegments();
			int iFdp = 0, iBlock = 0, iDuty = 0, iFT = 0;

			//dbg = "loop calculateDutyValues>";

			duty->calculateDutyValues();
			duty->calculateFDP(iFDPMode);
			duty->calculateDutyBlockTime();
			iFdp = duty->getFDPInSecs();
			iBlock = duty->getBLKInMins();
			//duty->calculateDP();
			iDuty = duty->getDPInSecs();

			//dbg = "loop iFdp=0";
			if (iFdp < 0) iFdp = 0;
			if (iBlock < 0) iBlock = 0;
			if (iDuty < 0) iDuty = 0;

			//20180116 ain, comment
			//iCumFdp += iFdp;
			//iCumDp += iDuty;
			//iCumBlh += iBlock;

			time_t fdp_staTm, fdp_endTm;
			int iNumFlySegs = duty->getNumFlySegs();
			time_t temp_statm, temp_endtm;
			int iActCheckin = duty->getActualBriefMin() * 60;
			if (0 == iActCheckin)
				iActCheckin = duty->getMinBrief() * 60;

			int iActCheckout = duty->getActualDebriefMin() * 60;
			if (0 == iActCheckout)
				iActCheckout = duty->getMinDebrief() * 60;

			//dbg = "loop iNumFlySegs>0";

			if (iNumFlySegs > 0)
			{
				switch (iFDPMode)
				{
				case 0:
				{
					time_t starttime = duty->getFirstSegment()->getStartTimeUtcAct();
					fdp_staTm = duty->getFirstSegment()->getStartTimeUtcAct() - iActCheckin;
					fdp_endTm = duty->getLastFlySegment()->getEndTimeUtcAct();
					break;
				}
				//check in to last segment
				case 1:
				{
					fdp_staTm = duty->getFirstSegment()->getStartTimeUtcAct() - iActCheckin;
					fdp_endTm = duty->getLastSegment()->getEndTimeUtcAct();
					break;
				}
				case 2:
				{
					fdp_staTm = duty->getFirstSegment()->getStartTimeUtcAct() - iActCheckin;
					fdp_endTm = duty->getLastSegment()->getEndTimeUtcAct() + iActCheckout;
					break;
				}
				case 3:
				{
					fdp_staTm = duty->getFirstSegment()->getStartTimeUtcAct() - iActCheckin;
					fdp_endTm = duty->getLastSegment()->getEndTimeUtcAct() + iActCheckout;
					break;
				}
				default:
				{
					break;
				}
				}
				temp_statm = fdp_staTm;
				temp_endtm = fdp_endTm;
				if (fdp_staTm < DayStart) temp_statm = DayStart;
				if (fdp_endTm > DayEnd) temp_endtm = DayEnd;
				if (temp_endtm < temp_statm) temp_endtm = temp_statm;
				fdp += round((iFdp* ((temp_endtm - temp_statm) / 60.0)) / (fdp_endTm - fdp_staTm));
			}

			//dbg = "loop long dp_staTm, dp_endTm;>0";

			long dp_staTm, dp_endTm;
			if (duty->getNumSegments() > 0)
			{
				dp_endTm = duty->getLastSegment()->getEndTimeUtcAct() + iActCheckout;
				dp_staTm = duty->getFirstSegment()->getStartTimeUtcAct() - iActCheckin;
			}
			else
			{
				dp_staTm = duty->getStartTimeUtcAct();
				dp_endTm = duty->getEndTimeUtcAct();
			}
			temp_statm = dp_staTm;
			temp_endtm = dp_endTm;
			if (dp_staTm < DayStart) temp_statm = DayStart;
			if (dp_endTm > DayEnd) temp_endtm = DayEnd;
			if (temp_endtm < temp_statm) temp_endtm = temp_statm;
			//20180316 ain, mantis#2976, 计算 last segment assignment前先判断 duty.numSegment>0
			SharedPtr<ASSIGNMENT> lastAssignment;
			if (duty->getNumSegments() > 0) {
				lastAssignment = data->assignmentNameMap[duty->getLastSegment()->getAssignment()];
			}
			if (lastAssignment && lastAssignment->DP_PCT == 0)
				dp_endTm = dp_endTm - iActCheckout;
			if (min(dp_endTm, DayEnd) > max(dp_staTm, DayStart))
				dp += round((min(dp_endTm, DayEnd) - max(dp_staTm, DayStart)) / 60.0);
			else
				dp = 0;

			blh = 0; iBlock = 0, iFT = 0;
			//dbg = "loop seglist";
			cust_start = dp_staTm, cust_end = dp_endTm;
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				Segment * segment = duty->getSegment(si);
				SharedPtr<ASSIGNMENT> assignment = data->assignmentNameMap[segment->getAssignment()];

				iBlock = segment->getBlkMinutes();
				iFT = segment->getFTTime();

				if (segment->getAssignment() == "PNC")
				{
					hasPNC = true;
					if (si == 0)
						cust_start = segment->getEndTimeUtcAct();
					else if (si == duty->getNumSegments() - 1)
						//0002239: 8002 custom DP計算有誤
						//cust_end = segment->getStartTimeUtcAct() + 30 * 60;
						cust_end = duty->getSegment(si - 1)->getEndTimeUtcAct() + 30 * 60;
				}

				if (assignment)
					iFT = round(iFT * (*assignment).FT_PCT);

				if (iBlock < 0) iBlock = 0;
				time_t endTm = segment->getEndTimeUtcAct();
				time_t staTm = segment->getStartTimeUtcAct();
				if (staTm < DayStart) temp_statm = DayStart;
				if (endTm > DayEnd) temp_endtm = DayEnd;

				//mantis#1665, 针对可能出现 dutyStart=dutyEnd=segStart=segEnd，增加预判避免分母为0
				if (endTm != staTm)
				{
					if ((staTm > DayStart && staTm < DayEnd) || (endTm > DayStart && endTm < DayEnd))
					{
						temp_statm = staTm;
						temp_endtm = endTm;
						if (staTm < DayStart) temp_statm = DayStart;
						if (endTm > DayEnd) temp_endtm = DayEnd;
						blh += round((iBlock*((temp_endtm - temp_statm) / 60.0)) / (endTm - staTm));
						if (segment->getDBId()>0)
							ft += round((iFT*((temp_endtm - temp_statm) / 60.0)) / (endTm - staTm));

						if (blh == 0 && segment->getIsOperating())
						{
							//throw exception: blh is ZERO
							stringstream ss;
							ss << "Segment blh is 0, flt_id=" << segment->getDBId();
							ss << " time = " << utcToUtcString(staTm) << "->" << utcToUtcString(endTm);
							ss << " Day = " << utcToUtcString(DayStart) << "->" << utcToUtcString(DayEnd);
							ss << " temp_tm = " << utcToUtcString(temp_statm) << "->" << utcToUtcString(temp_endtm);
							ss << " iBlock = " << iBlock;
							cout << "Exception:" << ss.str() << endl;
							Logger::getRuleLogger()->error(ss.str());
							return;
						}
					}
				}
				//}
			}
		}
	}

	temp->blh = blh;
	temp->dp = dp;
	temp->fdp = fdp;
	temp->ft = ft;

	temp->cust_dp = dp;
	if (_roster->duty == "RB") {
		temp->cust_dp = 0;
	}
	else if (hasPNC)
	{
		if (min(cust_end, DayEnd) > max(cust_start, DayStart))
			temp->cust_dp = round((min(cust_end, DayEnd) - max(cust_start, DayStart)) / 60.0);
		else
			temp->cust_dp = 0;
		if (temp->cust_dp < 0)
			temp->cust_dp = 0;
	}
}
*/

//OP#1583, [MANDAY_STANDBY_CALCULATION_MODE] = START_DATE_ONLY 则只保留首日 SBY, 默认保留全部
void calListKeepStartSbyOnly(SharedPtr<CrewDataContext>& data, vector<SharedPtr<CREW_MANDAY_BASIC>>& list) {
	if (data->systemParamMap["MANDAY_STANDBY_CALCULATION_MODE"] == "START_DATE_ONLY") {
		bool hasSby = false;
		for (auto& mday : list) {
			if (mday->STANDBY) {
				if (hasSby) {
					mday->STANDBY = mday->CSB = mday->HSB = mday->ASB = 0;
				}
				else {
					hasSby = true;
				}
			}
		}
	}
}

void calNumOfDowngradeInAScenario(SharedPtr<CrewDataContext> data)
{
	vector<SharedPtr<CREW>> crews = data->crewList;

	time_t lCheckedStart = data->scenario.startDtUTC;
	time_t lCheckedEnd = data->scenario.endDtUTC;

	//int iTotalOfDowngrade = 0, iTotalOfDowngradeBH = 0;
	string actingRank;
	for (vector<SharedPtr<CREW>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
	{
		vector<SharedPtr<ROSTER>>& rosters = (*crew)->rosterList;
		vector<SharedPtr<CREW_RANK>>& ranks = (*crew)->rankList;
		string crewId = (*crew)->idCrew;

		if (rosters.size() == 0)
			continue;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, (*roster)->actStrUtc, (*roster)->restStrUtc)))
				continue;
			//by default, it is "add roster"
			updateDowngrade((*crew), (*roster), true, lCheckedStart, lCheckedEnd);
		}
	}
}

void updateDowngrade(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, bool isAddRsoter, time_t checkStart, time_t checkEnd)
{
	string actingRank = roster->actingRank;
	vector<SharedPtr<CREW_RANK>> ranks = crew->rankList;

	bool isCross = false;
	string activeRank;
	for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
	{
		// 地面任务没有rank
		if (((*rank)->effUtc >= roster->actStrUtc) || ((*rank)->rank == actingRank) || actingRank.size() == 0)
			continue;

		if ((*rank)->expUtc == NULL || (*rank)->expUtc < 0 || (*rank)->expUtc >= roster->actStrUtc)
			if (actingRank != (*rank)->rank)
			{
				activeRank = (*rank)->rank;
				try {
					if (isAddRsoter)
					{
						//if (activeRank == "CP" && actingRank == "DP")
						//	printf("");
						RuleStatistics::GetInstancePtr()->setNumberOfDowngrade(actingRank, 1);
						RuleStatistics::GetInstancePtr()->setNumberOfDowngrade(activeRank, actingRank, 1);
					}
					else
					{
						RuleStatistics::GetInstancePtr()->setNumberOfDowngrade(actingRank, -1);
						RuleStatistics::GetInstancePtr()->setNumberOfDowngrade(activeRank, actingRank, -1);
					}
					isCross = true;
				}
				catch(...) {
					isCross = false;
					Logger::getRuleLogger()->error("[ERROR] invalid data, roster actingRank {} or crew activeRank {} does not exist in the rank table. rosterId:{},crewId:{}", actingRank, activeRank, roster->rosterId, roster->idcrew);
				}
				
			}

	}

	if (roster->pairing && isCross)
	{
		double totalBLK = 0;
		if (roster->actStrUtc < checkStart || roster->actRestStrUtc > checkEnd)
		{
			time_t rosterStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->actStrUtc, 8 * 60);
			if (crew->division == "P")
			{
				for (auto& manday : crew->mandayFdList)
				{
					if (manday->crewDateUtc < rosterStart)
						continue;
					else if (manday->crewDateUtc > roster->actRestStrUtc)
						break;
					else if (manday->crewDateUtc >= checkStart && manday->crewDateUtc <= checkEnd)
					{
						totalBLK += manday->blh;
					}
				}
			}
			else
			{
				for (auto& manday : crew->mandayCcAmList)
				{
					if (manday->crewDateUtc < rosterStart)
						continue;
					else if (manday->crewDateUtc > roster->actRestStrUtc)
						break;
					else if (manday->crewDateUtc >= checkStart && manday->crewDateUtc <= checkEnd)
					{
						totalBLK += manday->blh;
					}
				}
			}
		}
		else
		{
			totalBLK = static_cast<double>(roster->pairing->getBLKInSec() / 60);
		}

		if (isAddRsoter)
		{
			RuleStatistics::GetInstancePtr()->setNumberOfBlockDowngrade(actingRank, (int)totalBLK);
			RuleStatistics::GetInstancePtr()->setNumberOfBlockDowngrade(activeRank, actingRank, (int)totalBLK);
		}
		else
		{
			RuleStatistics::GetInstancePtr()->setNumberOfBlockDowngrade(actingRank, (int)(-totalBLK));
			RuleStatistics::GetInstancePtr()->setNumberOfBlockDowngrade(activeRank, actingRank, (int)(- totalBLK));
		}
	}

}


void calNumOfPatternInAScenario(SharedPtr<CrewDataContext> _dbData)
{
	vector<SharedPtr<CREW>>& crews = _dbData->crewList;
	time_t start = _dbData->scenario.startDtUTC;
	time_t end = _dbData->scenario.endDtUTC + 24 * 3600 - 1;
	vector<DBRule> rules = RuleParams::GetInstancePtr()->getPatterRuleParams();
	vector<DBRule> rules8173 = RuleParams::GetInstancePtr()->getPatteByDaterRuleParams();
	//vector<DBRule>&  dbRules = _dbData->ruleList;
	//for (vector<DBRule>::const_iterator dbRule = dbRules.begin(); dbRule != dbRules.end(); ++dbRule)
	//{
	//	if ((*dbRule).function == RULES::MAX_PTN_IN_SCENARIO)
	//		rules.push_back((*dbRule));
	//}
	//for (vector<SharedPtr<CREW>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
	for (auto& crew : crews)
	{
		updatePatternStat(crew, crew->rosterList, rules, true, start, end);
		updatePatternStatByDate(_dbData, crew, crew->rosterList, rules8173, true, start, end);
	}
}


int getNumberOfDaysOffInScenario(SharedPtr<CrewDataContext> data, int crewIndex)
{
	int iReturn = 0;

	if (crewIndex >= 0)
	{
		vector<SharedPtr<DBRule_8014>>& assignments = data->rule_8014;

		vector<string> daysOffs, restAssignments;
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
		{
			if ((*assignment)->assignmentGroup == "DO" && (data->version == 3 || (*assignment)->airline == data->scenario.airline))
				restAssignments.push_back((*assignment)->assignemnt);
			if ((*assignment)->assignmentGroup == "DO" && (data->version == 3 || (*assignment)->airline == data->scenario.airline))
				daysOffs.push_back((*assignment)->assignemnt);
		}
		vector<SharedPtr<ROSTER>>& rosters = data->crewList[crewIndex]->rosterList;
		string base = Utility::GetInstancePtr()->getCrewPrimaryBase(data->crewList[crewIndex]->baseList, data->scenario.endDtUTC);
		int offsetMinutes = 0;
		if (base.empty())
			base = data->scenario.bases[0];
		if (!base.empty())
			offsetMinutes = data->getAirportOffsetMinutes(base);
		//map<string, string> syss = data->systemParamMap;
		bool bDaysOffAtBase = false;
		for (map<string, string>::const_iterator sys = data->systemParamMap.begin(); sys != data->systemParamMap.end(); ++sys)
		{
			if ((*sys).first == "DAYS_OFF_ONLY_AT_CREW_BASE")
			{
				bDaysOffAtBase = ((*sys).second == "Y");
			}
		}
		//iReturn = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, true, data->scenario.startDtUTC, data->scenario.endDtUTC+24*3600);
		iReturn = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, data->scenario.startDtUTC, data->scenario.endDtUTC + 24 * 3600, offsetMinutes, true, true, data->airportCodeMap, "");
	}
	return iReturn;
}


//完全按输入 rosters计算manday, 不改变crew.mandayCC
vector<SharedPtr<CREW_MANDAY_CC_AM>> calMandaysCcAmByAllRosters(LegalityChecker* ruleEngine, SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>>& rosters, bool bDebug)
{
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandays;
	BasicCalculation calculator(data, crew);
	calculator.setRuleEngine(ruleEngine);
	int rosterCount = 0;

	//printf(">> calMandaysCcAmByAllRosters(crew=%s,rosters.size=%d)\n", sCrewID.c_str(), rosters.size());
	if (!bDebug)
	{
		map<time_t, SharedPtr<CREW_MANDAY_BASIC>> mBasics = calculator.calculateManDays(crew->rosterList);
		for (auto& mday : mBasics)
		{
			vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator it;
			for (it = mandays.begin(); it != mandays.end(); ++it)
			{
				//mantis#3401, 按local汇总合并
				if ((*it)->crewDateUtc == mday.second->crewDateUtc
					|| (*it)->dateLoc == mday.second->dateLoc)
				{
					break;
				}
			}
			//mantis#3401, 计算结果manday日期在原manday中已经存在则执行add累加，否则创建并添加新manday
			if (it != mandays.end()) {
				(*it)->addFrom(mday.second.get(), false);
			}
			else {
				SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
				item->copyFrom(mday.second.get());
				mandays.push_back(item);
			}
		}
	}
	else
	{
		for (vector<SharedPtr<ROSTER>>::iterator it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
		{
			//if ((*it_roster)->isCalculated)
			//	continue;

			(*it_roster)->isCalculated = true;

			//printf("dbg setCalculatedObject  ");
			calculator.setCalculatedObject((*it_roster));
			//printf("dbg calculate  ");
			calculator.calculate();
			calculatePairingDutyTimes((*it_roster)->pairing, data.get());
			//筛选统计值存在的manday记录
			//printf("dbg calculateManDay  ");
			vector<SharedPtr<CREW_MANDAY_BASIC>> mandayBasic = calculator.calculateManDay();
			bool isHalf = Utility::GetInstancePtr()->isHalfRoster((*it_roster));

			vector<SharedPtr<CREW_MANDAY_BASIC>> temp;
			//printf("dbg loop mandayBasic\n");
			for (std::size_t i = 0; i < mandayBasic.size(); i++)
			{
				if (!mandayBasic[i]->isEmpty())
					temp.push_back(mandayBasic[i]);
			}

			////TEST
			////if (sCrewID == "BR115279") {
			//	char strBuf[100] = { 0 };
			//	utcToUtcStr(it_roster->get()->strUtc, strBuf, sizeof(strBuf));
			//	char endBuf[100] = { 0 };
			//	utcToUtcStr(it_roster->get()->endUtc, endBuf, sizeof(endBuf));
			//	string base = it_roster->get()->location;
			//	if (it_roster->get()->pairing != NULL) 
			//	{
			//		base = it_roster->get()->pairing->getBase();
			//	}
			/////TEST

			for (auto& mday : temp)
			{
				vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator it;
				for (it = mandays.begin(); it != mandays.end(); ++it)
				{
					//mantis#3401, 按local汇总合并
					if ((*it)->crewDateUtc == mday->crewDateUtc
						|| (*it)->dateLoc == mday->dateLoc)
					{
						break;
					}
				}
				if (it != mandays.end())
				{
					(*it)->addFrom(mday.get(), isHalf);
				}
				else
				{
					SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
					item->copyFrom(mday.get());
					mandays.push_back(item);
				}
			}
			//printf("dbg\n");
		}
	}
	//delete calculator;
	//calculator = NULL;
	//printf("<< calMandaysCcAmByAllRosters\n");
	return mandays;
}

//计算某个CREW的ROSTES列表里所有rosters数据的man days
vector<SharedPtr<CREW_MANDAY_FD>> calMandaysFdByAllRosters(LegalityChecker* ruleEngine, SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>>& rosters) {

	vector<SharedPtr<CREW_MANDAY_FD>> mandays;
	BasicCalculation calculator(data, crew);
	calculator.setRuleEngine(ruleEngine);
	//bool isHalf = false;
	for (vector<SharedPtr<ROSTER>>::iterator it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster){

		//20180427 ain, mantis#3190, 注释isCalculated判断，避免manday计算被忽略
		//if ((*it_roster)->isCalculated)
		//	continue;

		(*it_roster)->isCalculated = true;

	}
	map<time_t, SharedPtr<CREW_MANDAY_BASIC>> basics = calculator.calculateManDays(rosters, true);
	for (map<time_t, SharedPtr<CREW_MANDAY_BASIC>>::iterator basic = basics.begin(); basic != basics.end(); ++basic)
	{
		vector<SharedPtr<CREW_MANDAY_FD>>::iterator it;
		for (it = mandays.begin(); it != mandays.end(); it++){
			//mantis#3401, 按local汇总合并
			if ((*it)->crewDateUtc == basic->second->crewDateUtc
				|| (*it)->dateLoc == basic->second->dateLoc) {
				break;
			}
		}
		SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
		item->copyFrom(basic->second.get());
		mandays.push_back(item);
	}
	//delete calculator;
	//calculator = NULL;
	return mandays;
}


vector<SharedPtr<CREW_MANDAY_BASIC>> calCcAmPerDiemAllRosters(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>>& rosters)
{
	vector<SharedPtr<CREW_MANDAY_BASIC>> mandays;

	string base = crew->getPrimeBase();
	auto offsetMinutes = data->getAirportOffsetMinutes(base);
	string location;
	int perDiem = 0;
	int firstHalf = -1;
	int iDaysBetween;
	time_t start, end, DayStart, DayEnd;
	for (std::size_t i = 0; i < rosters.size(); ++i)
	{
		if (!(rosters[i]->pairing))
			continue;

		location = rosters[i]->location;
		if (Utility::GetInstancePtr()->isHalfRoster(rosters[i]))
		{
			if (location == base)
				firstHalf = (int)i;
			else
			{
				if (firstHalf < 0)
				{
					printf("Exception in [calCcAmPerDiemAllRosters]:First Half roster index<0,crew=%s.\n", crew->idCrew.c_str());
					continue;
				}
				start = rosters[firstHalf]->actStrUtc;
				end = rosters[i]->restStrUtc;
				iDaysBetween = Utility::GetInstancePtr()->DaysBetween(start, end, offsetMinutes) + 1;
				time_t tempStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes);
				for (int j = 0; j < iDaysBetween; j++)
				{
					DayStart = tempStart + j * 24 * 60 * 60;
					DayEnd = DayStart + 24 * 60 * 60;
					SharedPtr<CREW_MANDAY_BASIC> temp = std::make_shared<CREW_MANDAY_BASIC>();
					temp->idCrew = crew->idCrew;
					temp->crewDateUtc = DayStart;
					temp->PER_DIEM = (int)round((min(DayEnd, end) - max(DayStart, start)) / (60.0));
					mandays.push_back(temp);
				}

				firstHalf = -1;
			}
		}
		else if (location == base)
		{
			iDaysBetween = Utility::GetInstancePtr()->DaysBetween(rosters[i]->actStrUtc, rosters[i]->restStrUtc, offsetMinutes) + 1;
			start = rosters[i]->actStrUtc;
			end = rosters[i]->restStrUtc;
			time_t tempStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes);
			for (int j = 0; j < iDaysBetween; j++)
			{
				DayStart = tempStart + j * 24 * 60 * 60;
				DayEnd = DayStart + 24 * 60 * 60;

				SharedPtr<CREW_MANDAY_BASIC> temp = std::make_shared<CREW_MANDAY_BASIC>();
				temp->idCrew = crew->idCrew;
				temp->crewDateUtc = DayStart;
				mandays.push_back(temp);
			}
		}
	}

	return mandays;
}


inline static int GetAccStateTimeZoneDiff(const Duty* prevDuty, const SharedPtr<CrewDataContext>& dbData) {
	string prevDutyDepZoneId = dbData->getAirportZoneId(prevDuty->getDepStation());
	string prevDutyArrZoneId = dbData->getAirportZoneId(prevDuty->getArrStation());
	int displacementTime = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(prevDuty->getStartTimeUtcAct(), prevDutyDepZoneId, prevDuty->getEndTimeUtcAct(), prevDutyArrZoneId));
	return displacementTime;
}

//是否第一个由适应状态到未适应状态，并且时区差6小时的DDO
inline static bool isFirstRecently6OffsetDDO(const SharedPtr<ROSTER>& prevWorkRoster, const SharedPtr<ROSTER>& currWorkRoster, const SharedPtr<CrewDataContext>& dbData) {
	//連續28天必須有7個DDO，這7個DDO不能是恢復6個以上時差適應狀態的第一個DDO
	if (prevWorkRoster == nullptr || prevWorkRoster->pairing == nullptr || currWorkRoster == nullptr) {
		return false;
	}

	if (currWorkRoster->pairing == nullptr) {
		//地面任务适应状态判断
		return false;
	}
	string prevAccState = prevWorkRoster->pairing->getLastDuty()->getAcclimatisedState();
	string currAccState = currWorkRoster->pairing->getFirstDuty()->getAcclimatisedState();
    int tzDiff = GetAccStateTimeZoneDiff(prevWorkRoster->pairing->getLastDuty(), dbData);
	 //时区差大于等于6小时
    if (prevAccState == "U" && currAccState == "A" && tzDiff >= 6*60)	 {
		return true;
	}
	return false;
}

inline static int GetEndTimeGapInSec(const SharedPtr<ROSTER>& roster) {
	if (roster->pairing == nullptr) {
		return RosterUtils::GetEndTimeGapInSec(roster.get(),  "ACT");
	}
	return RosterUtils::GetEndTimeGapInSec(roster->pairing->getLastSegment(), "ACT");
}

//mantis 3869
bool BasicCalculation::needCalcPH(string assignment, string qualifier, string location, string base)
{
	bool need = true;
	if (this->_dbData->isAssignmentInGroup(assignment, "GND") ||
		this->_dbData->isAssignmentInGroup(assignment, "ADM") ||
		this->_dbData->isAssignmentInGroup(assignment, "MTG") ||
		this->_dbData->isAssignmentInGroup(assignment, "RES") ||
		this->_dbData->isAssignmentInGroup(assignment, "EXT") ||
		this->_dbData->isAssignmentInGroup(assignment, "TRG"))
		need = false;

	if (this->_dbData->isAssignmentInGroup(assignment, "EXT") && qualifier == "CPC")
	{
		if (base != location)
			need = true;
		else
			need = false;
	}

	return need;
}



void BasicCalculation::calculateCommute(SharedPtr<CREW> crew)
{
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	//mantis#3797 CommuteHelper是用来维护存贮最近的满足rule的roster位置
	vector <int> CommuteHelper(rosters.size());
	for (std::size_t i = 0; i < rosters.size(); i++){
		CommuteHelper.at(i) = 99999;
	}
	for (auto& rule : this->_dbData->ruleList)
	{
		if (rule.function != RULES::COMMUTE_CALC_CHECK)
			continue;
		if (rule.params.size() <= 4)
			continue;
		auto& parameter = rule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;
		string strBases = "*", strPrevAirports, strPrevTypes, strPrevDropoff, strNextAirports, strNextTypes, strNextPickup, strPrevQualifiers, strNextQualifiers;
		string strCrewBase;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			//REQUESTED ASSIGNMENT GROUP,OVERRIDABLE ASSIGNMENT GROUPS
			if (header == "BASES")
				strBases = headeValue;
			if (header == "PREVIOUS AIRPORTS")
				strPrevAirports = headeValue;
			if (header == "PREVIOUS ROSTER TYPES")
				strPrevTypes = headeValue;
			if (header == "PREVIOUS ROSTER QUALIFIERS")
				strPrevQualifiers = headeValue;
			if (header == "DROP OFF IN PREVIOUS ROSTER")
				strPrevDropoff = headeValue;
			if (header == "NEXT AIRPORTS")
				strNextAirports = headeValue;
			if (header == "NEXT ROSTER TYPES")
				strNextTypes = headeValue;
			if (header == "NEXT ROSTER QUALIFIERS")
				strNextQualifiers = headeValue;
			if (header == "PICK UP IN NEXT ROSTER")
				strNextPickup = headeValue;
		}

		vector<string> bases, prevAirports, prevTypes, nextAirports, nextTypes, prevQualifiers, nextQualifiers;
		if (strBases != "*")
		{
			split(strBases, '|', bases);
			
			if (crew->baseList.size() == 1)
			{
				strCrewBase = crew->getPrimeBase();
				if (std::find(bases.begin(), bases.end(), strCrewBase) == bases.end())
					continue;
			}
		}
		split(strPrevAirports, '|', prevAirports);
		split(strPrevTypes, '|', prevTypes);
		split(strPrevQualifiers, '|', prevQualifiers);
		split(strNextAirports, '|', nextAirports);

		split(strNextTypes, '|', nextTypes);
		split(strNextQualifiers, '|', nextQualifiers);
		int dropoff = 0, pickup = 0;
		dropoff = hhmmToMinutes(strPrevDropoff.c_str());
		pickup = hhmmToMinutes(strNextPickup.c_str());

		for (std::size_t i = 0; i < rosters.size(); ++i)
		{
			if (strBases != "*" && crew->baseList.size() > 1)
			{
				strCrewBase = crew->getCrewBase(rosters[i]->actStrUtc);
				if (std::find(bases.begin(), bases.end(), strCrewBase) == bases.end())
					continue;
			}

			if (strPrevAirports != "*")
			{
				string rosterLocation;
				if (rosters[i]->pairing)
					rosterLocation = rosters[i]->pairing->getEndArp();
				else
					rosterLocation = rosters[i]->location;
				if (std::find(prevAirports.begin(), prevAirports.end(), rosterLocation) == prevAirports.end())
					continue;
			}

			if (strPrevTypes != "*")
			{
				if (std::find(prevTypes.begin(), prevTypes.end(), rosters[i]->duty) == prevTypes.end())
					continue;
			}

			if (strPrevQualifiers != "*")
			{
				if (std::find(prevQualifiers.begin(), prevQualifiers.end(), rosters[i]->qualifier) == prevQualifiers.end())
					continue;
			}

			if (i == rosters.size() - 1)
			{
				rosters[i]->communt = dropoff;
			}
			else
			{
				/*
				if (strNextAirports != "*")
				{
				string rosterLocation;
				if (rosters[i+1]->pairing)
				rosterLocation = rosters[i + 1]->pairing->getBase();
				else
				rosterLocation = rosters[i + 1]->location;
				if (std::find(nextAirports.begin(), nextAirports.end(), rosterLocation) == nextAirports.end())
				continue;
				}

				if (strNextTypes != "*")
				{
				if (std::find(nextTypes.begin(), nextTypes.end(), rosters[i + 1]->duty) == nextTypes.end())
				continue;
				}

				if (strNextQualifiers != "*")
				{
				if (std::find(nextQualifiers.begin(), nextQualifiers.end(), rosters[i + 1]->qualifier) == nextQualifiers.end())
				continue;
				}*/

				//0003656: [8088] ROSTER COMMUTE 修改判断下一个任务的逻辑
				int nextIndex = -1;
				for (std::size_t j = i + 1; j < rosters.size(); ++j)
				{
					if (strNextAirports != "*")
					{
						string rosterLocation;
						if (rosters[j]->pairing)
							rosterLocation = rosters[j]->pairing->getBase();
						else
							rosterLocation = rosters[j]->location;
						if (std::find(nextAirports.begin(), nextAirports.end(), rosterLocation) == nextAirports.end())
							continue;
					}

					if (strNextTypes != "*")
					{
						if (std::find(nextTypes.begin(), nextTypes.end(), rosters[j]->duty) == nextTypes.end())
							continue;
					}

					if (strNextQualifiers != "*")
					{
						if (std::find(nextQualifiers.begin(), nextQualifiers.end(), rosters[j]->qualifier) == nextQualifiers.end())
							continue;
					}
					nextIndex = (int)j;
					break;
				}

				if (nextIndex > 0 && CommuteHelper[i] > nextIndex)
				{
					CommuteHelper.at(i) = nextIndex;
					rosters[i]->communt = dropoff + pickup;
				}
			}
		}

	}
}

/*
副作用：可能修改 roster->pairing->duty.actWp
*/
vector<SharedPtr<mandayTimes>> BasicCalculation::getCrewManDayTimes(vector<SharedPtr<ROSTER>>& rosterList, bool setCalculated)
{
	const int MAX_TRANSIT_WP = 60 * 60;

	vector<SharedPtr<mandayTimes>>  resultAll;
	std::size_t mandayEstimate = 0;
	for (const auto &roster : rosterList) {
		if (roster->pairing) {
			if (roster->pairing->isMandayOtherCalculated())
				mandayEstimate += roster->pairing->getMandayOtherTimes().size();
			else
				mandayEstimate += (roster->pairing->getSegmentsRead().size() + roster->pairing->getNumDuties() * 4);
		}
		else
			mandayEstimate++;
	}
	resultAll.reserve(mandayEstimate);

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	const static CalculationManday DP = this->_dbData->getCalculationManday("DP");
	const static CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
	const static CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
	const static CalculationManday ACT_DP = this->_dbData->getCalculationManday("ACT DP");
	const static CalculationManday BH = this->_dbData->getCalculationManday("BH");
	const static CalculationManday FT = this->_dbData->getCalculationManday("FT");
	const static CalculationManday CUST_DP = this->_dbData->getCalculationManday("CUST_DP");

	string airlinecode = this->_dbData->scenario.airline;
	vector<SharedPtr<ROSTER>> rosters;
	//string airlineBase = "TPE";
	//20180420 ain, mantis#3169, 重新启用被注释 rosterList.size > 0逻辑
	if (rosterList.size() > 0)
		rosters = rosterList;
	else
		rosters = _crew->rosterList;
	
	string base;
	if (_crew)
		base = this->_crew->getPrimeBase();
	else
		base = this->_roster->location;

	auto baseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	time_t fdpStart, fdpEnd, dpStart, dpEnd, cust_dp_start, cust_dp_end;
	time_t act_fdpStart, act_fdpEnd, act_dpStart, act_dpEnd;
	bool isOverlap = false, isHomeSby = false, isCompanySby = false, isGround = false, isPncBackToBase = false;
	bool isAirlineBR = (airlinecode == "BR");
	int offsetMinutes = 0;
	int firstHalf = -1;
	time_t localStart;
	string qualifier;
	bool beforeIsCallout = false;
	for (std::size_t i = 0; i < rosters.size(); ++i)
	{
		//test
		//if (rosters[i]->rosterId != -98) {
		//	continue;
		//}
		
		//20190627 yuankai.cai mantis#5935/5918 修改初始化逻辑 保证标记正确
		// mantis#6303, EVA抓飛時需要參考前面的待命, 因此不可先初始化
		if (!isAirlineBR)
		{
			isOverlap = false, isHomeSby = false, isCompanySby = false, isGround = false, isPncBackToBase = false;
		}
		
		qualifier = rosters[i]->qualifier;
		if (setCalculated)
			rosters[i]->isCalculated = true;
		//if ((rosters[i]->pairId == 1762006))
		//if (this->_crew->idCrew == "F88044" && rosters[i]->actStrUtc >= 1533052800)
		//printf("");
		map<string, SharedPtr<ASSIGNMENT>>::iterator dbRosterAssignment = this->_dbData->assignmentNameMap.find(qualifier);

		string divide = "E";
		double dp_pct = 1.0;
		double credit_pct = 1.0;
		int DP_Gap = 0;
		int beforePct = 0;
		int afterPct = 0;
		if (dbRosterAssignment != this->_dbData->assignmentNameMap.end())
			if (dbRosterAssignment->second) {
				divide = dbRosterAssignment->second->divideCrewManday;
				dp_pct = dbRosterAssignment->second->DP_PCT;
				credit_pct = dbRosterAssignment->second->CREDIT_PCT;
				DP_Gap = dbRosterAssignment->second->DP_GAP;
				beforePct = dbRosterAssignment->second->before_pct_dp_gap;
				afterPct = dbRosterAssignment->second->after_pct_dp_gap;
			}


		int iBHAdj = 0;
		if (rosters[i]->pairing)
		{
			iBHAdj = rosters[i]->pairing->getBlockMinsAdjustment() * 60;
		}

		//bool hasDic = false;
		//if (rosters[i]->pairing && rosters[i]->pairing->isMandayOtherCalculated()) {
		//	
		//	if (_dbData->scenario.airline == "BR") {
		//		/*const auto& dictionList = this->_dbData->dictionaryMap["FT_PCT_BY_ACTING_RANK"];
		//		for (const auto& dic : dictionList) {
		//			if (rosters[i]->actingRank == dic->code) {
		//				hasDic = true;
		//			}
		//		}*/

		//	}
		//	// 如果pairing上有rank是不需要计算blh的，则重新计算manday
		//	const auto & crewOnPairings = this->_dbData->crewOnPairing[rosters[i]->pairId];
		//	for (const auto & crewOnPairing : crewOnPairings) {
		//		bool isIncludeInFt = true;
		//		if (this->_dbData->rankMap.find(crewOnPairing->actingRank) != this->_dbData->rankMap.end()) {
		//			if (!this->_dbData->rankMap[crewOnPairing->actingRank].isIncludeInFt)
		//				hasDic = true;
		//		}

		//	}
		//	if (!hasDic) {
		//		const auto& mandays = rosters[i]->pairing->getMandayOtherTimes();
		//		resultAll.insert(resultAll.end(), mandays.begin(), mandays.end());
		//		
		//		if (isAirlineBR)
		//		{
		//			isOverlap = false, isHomeSby = false, isCompanySby = false, isGround = false, isPncBackToBase = false;
		//		}				
		//		continue;
		//	}
		//	
		//}

		vector<shared_ptr<mandayTimes>> result;//当前排班roster的manday时间相关数据
		time_t rLocalStartDay = rosters[i]->actStrUtc;

		if (qualifier == "AL" || qualifier == "RAL")
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::AL;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		}

		if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, "RDO"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::RDO;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		} 
		if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, "DO"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::DO;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		}
		else if (this->_dbData->isAssignmentInGroup(rosters[i]->duty, "SBY"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::SBY;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		}
		else if (this->_dbData->isAssignmentInGroup(rosters[i]->duty, "GND"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::GND;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			temp->percentage = dp_pct;
			result.push_back(temp);
			isGround = true;
		}
		else if (this->_dbData->isAssignmentInGroup(rosters[i]->duty, "LEA"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::LEA;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		}
		else if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, "U/A"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::UA;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		}
		else if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, "GREY"))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::GREY;
			temp->start = rosters[i]->actStrUtc;
			temp->end = rosters[i]->actRestStrUtc;
			temp->setValue = 1;
			temp->divide = divide;
			temp->credit_percentage = credit_pct;
			result.push_back(temp);
		}
		/*if (_dbData->scenario.airline == "BR" && this->_dbData->isAssignmentInGroup(rosters[i]->duty, "SBY"))
		{*/
			if (_dbData->isAssignmentInGroup(rosters[i]->qualifier, "CSB"))
			{
				SharedPtr<mandayTimes> temp(new mandayTimes());
				temp->types = CALCULATION_TYPES::CSB;
				temp->start = rosters[i]->actStrUtc;
				temp->end = rosters[i]->actRestStrUtc;
				temp->setValue = 1;
				temp->divide = divide;
				temp->credit_percentage = credit_pct;
				result.push_back(temp);
				isCompanySby = true;
			}
			if (_dbData->isAssignmentInGroup(rosters[i]->qualifier, "ASB"))
			{
				SharedPtr<mandayTimes> temp(new mandayTimes());
				temp->types = CALCULATION_TYPES::ASB;
				temp->start = rosters[i]->actStrUtc;
				temp->end = rosters[i]->actRestStrUtc;
				temp->setValue = 1;
				temp->divide = divide;
				temp->credit_percentage = credit_pct;
				result.push_back(temp);
			}
			if (_dbData->isAssignmentInGroup(rosters[i]->qualifier, "HSB"))
			{
				SharedPtr<mandayTimes> temp(new mandayTimes());
				temp->types = CALCULATION_TYPES::HSB;
				temp->start = rosters[i]->actStrUtc;
				temp->end = rosters[i]->actRestStrUtc;
				temp->setValue = 1;
				temp->divide = divide;
				temp->credit_percentage = credit_pct;
				result.push_back(temp);
				isHomeSby = true;
			}
		//}

		//rest duty
		if (RuleParams::GetInstancePtr()->isRestAssignment(rosters[i]->qualifier, rosters[i]->duty)) {
			resultAll.insert(resultAll.end(), result.begin(), result.end());
			if (rosters[i]->pairing) 
				rosters[i]->pairing->setMandyOtherTimes(std::move(result));			

			if (isAirlineBR)
			{
				isOverlap = false, isHomeSby = false, isCompanySby = false, isGround = false, isPncBackToBase = false;
			}
			continue;
		}

		if (i + 1 < rosters.size())
		{
			////ground duty
			//if (isGround)
			//{
			//	if (base == rosters[i]->location)
			//		offsetMinutes = baseOffsetMinutes;
			//	else if(rosters[i]->location=="")
			//		offsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[i]->pairing->getBase());
			//	else
			//		offsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[i]->location);
			//	localStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i]->actStrUtc, offsetMinutes);
			//	if (localStart == Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i + 1]->actStrUtc, offsetMinutes))
			//	{
			//		if (!(RuleParams::GetInstancePtr()->isRestAssignment(rosters[i + 1]->duty)))
			//		{
			//			isOverlap = true;
			//			resultAll.insert(resultAll.end(), result.begin(), result.end());
			//			if (rosters[i]->pairing)
			//				rosters[i]->pairing->setMandyOtherTimes(std::move(result));
			//			continue;
			//		}
			//	}

			//}
			////HOME & COMPANY STANDBY
			//else 
			if (!isOverlap && Utility::GetInstancePtr()->isTimeOverlap(rosters[i]->actStrUtc, rosters[i]->actRestStrUtc, rosters[i + 1]->actStrUtc, rosters[i + 1]->actRestStrUtc))
			{
				if (!(RuleParams::GetInstancePtr()->isRestAssignment(rosters[i + 1]->qualifier, rosters[i + 1]->duty)))
				{
					if (isHomeSby || isCompanySby)
						isOverlap = true;
					//CASE 18
					if (isOverlap) {
						resultAll.insert(resultAll.end(), result.begin(), result.end());
						if (rosters[i]->pairing)
							rosters[i]->pairing->setMandyOtherTimes(std::move(result));
						continue;
					}
					isOverlap = false;
				}
			}
		}

		if (!(rosters[i]->pairing))
		{
			SharedPtr<mandayTimes> temp(new mandayTimes());
			temp->types = CALCULATION_TYPES::DP;
			temp->start = rosters[i]->getStartTimeUtc(DP.str);
			temp->end = rosters[i]->getRestStartUtc(DP.end);
			temp->percentage = dp_pct;
			temp->credit_percentage = credit_pct;
			temp->beforePct = beforePct;
			temp->afterPct = afterPct;

			if (Utility::GetInstancePtr()->checkCoverdDPGapTimeRange(rosters[i]->getStartTimeLocAct(), rosters[i]->getRestStartLocAct(), _dbData.get())) {
				temp->dp_gap = DP_Gap;
			}

			if (i != rosters.size() - 1) {
				
				long standbyDP = _ruleEngine->CalculateStandbyDP_TG(rosters[i], rosters[i + 1]);
				if (standbyDP >= 0) {
					temp->end = temp->start + standbyDP;
					temp->percentage = 1.0;
					temp->beforePct = 0;
					temp->dp_gap = 0;
					temp->afterPct = 0;
				}
			}
			long groundDp = _ruleEngine->CalculateGroundDP_TG(rosters[i]);
			if (groundDp > 0) {
				temp->end = temp->start + groundDp;
				temp->percentage = 1.0;
				temp->beforePct = 0;
				temp->dp_gap = 0;
				temp->afterPct = 0;
			}

			long dp_adjust = 0;
			if (i != rosters.size() - 1) {
				dp_adjust = CalculateDPForPR(nullptr, rosters[i], rosters[i + 1], beforeIsCallout, this->_dbData);
			}
			temp->adjust_for_pr = dp_adjust;
			long dp = ((temp->end - temp->start + temp->beforePct * 60) * temp->percentage) / 60 + temp->dp_gap + dp_adjust / 60;
			if (i != rosters.size() - 1) {
				long hxDp = CalculateDPForHX(rosters[i], rosters[i + 1]);
				if (hxDp >= 0) {
					dp = hxDp;
					temp->end = temp->start + hxDp * 60;
					temp->percentage = 1.0;
					temp->beforePct = 0;
					temp->dp_gap = 0;
					temp->afterPct = 0;
					temp->adjust_for_pr = 0;
				}
			}
			rosters[i]->dutyValues.setActDp(0, dp);
			result.push_back(temp);

			if (rosters[i]->duty != "RB")
			{
				SharedPtr<mandayTimes> tempCust(new mandayTimes());
				tempCust->types = CALCULATION_TYPES::CUST_DP;
				tempCust->start = rosters[i]->getStartTimeUtc(CUST_DP.str);
				tempCust->end = rosters[i]->getRestStartUtc(CUST_DP.end);
				tempCust->credit_percentage = credit_pct;
				result.push_back(tempCust);
			}

			if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, "SBY")) {
				SharedPtr<mandayTimes> tempSBYDp(new mandayTimes());
				tempSBYDp->types = CALCULATION_TYPES::SBY_DP;
				tempSBYDp->start = rosters[i]->getStartTimeUtc(DP.str);
				tempSBYDp->end = rosters[i]->getRestStartUtc(DP.end);
				tempSBYDp->percentage = dp_pct;
				result.push_back(tempSBYDp);
			}
			if (!this->_dbData->getRuleFunctions(RULES::CALCULATE_COURSE_FDP_FOR_TG).empty()) {
				int fdp = _ruleEngine->CalculateCourseRosterGroundFDPForTG(rosters[i]);
				SharedPtr<mandayTimes> temp(new mandayTimes());
				temp->types = CALCULATION_TYPES::FDP;
				temp->start = rosters[i]->getStartTimeUtc(FDP.str);
				temp->end = rosters[i]->getStartTimeUtc(FDP.str) + fdp * 60;
				temp->percentage = 1.0;
				result.push_back(temp);
				
			}
			
			if (credit_pct > 0.0001) {
				//地面任务添加虚拟的CALCULATION_TYPES::BH，其中percentage=0，用于解决地面任务SIM计算credit问题
				SharedPtr<mandayTimes> temp(new mandayTimes());
				temp->types = CALCULATION_TYPES::BH;
				temp->start = rosters[i]->getStartTimeUtc(DP.str);
				temp->end = rosters[i]->getRestStartUtc(DP.end);
				temp->percentage = 0;
				temp->credit_percentage = credit_pct;
				result.push_back(temp);
			}

			resultAll.insert(resultAll.end(), result.begin(), result.end());
			
			if (isAirlineBR)
			{
				isOverlap = false, isHomeSby = false, isCompanySby = false, isGround = false, isPncBackToBase = false;
			}			
			continue;
		}
		else
		{
			
			int dutiesSize = (int)rosters[i]->pairing->getNumDuties();
			for (int j = 0; j < (int)rosters[i]->pairing->getNumDuties(); j++)
			{
				Duty* duty = rosters[i]->pairing->getDuty(j);

				fdpStart = duty->getFDPStartUtcTimes(FDP.str);
				act_fdpStart = duty->getFDPStartUtcTimes(ACT_FDP.str);

				dpStart = duty->getStartTimeUtc(DP.str);
				dpEnd = duty->getEndTimeUtc(DP.end);
				act_dpStart = duty->getStartTimeUtc(ACT_DP.str);
				act_dpEnd = duty->getEndTimeUtc(ACT_DP.end);

				cust_dp_start = duty->getStartTimeUtc(CUST_DP.str);

				if (rosters[i]->duty != "RB")
					cust_dp_end = dpEnd;
				else
					cust_dp_end = cust_dp_start;

				Segment* lastFly = duty->getLastFlySegment();
				if (lastFly)
				{
					fdpEnd = lastFly->getEndTimeUtc(FDP.end);
					act_fdpEnd = lastFly->getEndTimeUtc(ACT_FDP.end);
				}
				else
				{
					fdpEnd = fdpStart;
					act_fdpEnd = act_fdpStart;
				}

				if (_dbData->scenario.airline != "BR")
				{
					fdpEnd = duty->getFDPEndMinusLongRestUtcTimes(FDP.end);
					act_fdpEnd = duty->getFDPEndMinusLongRestUtcTimes(ACT_FDP.end);
					if (fdpEnd <= 0)
						fdpEnd = fdpStart;
					if (act_fdpEnd <= 0)
						act_fdpEnd = act_fdpStart;
				}
				const vector<Segment*>& segments = duty->getSegments();
				int totalFt = 0;
				for (std::size_t k = 0; k < segments.size(); ++k)
				{
					string assignment = segments[k]->getAssignment();

					SharedPtr<ASSIGNMENT> dbAssignment = nullptr;

					if (this->_dbData->assignmentNameMap.find(assignment) != this->_dbData->assignmentNameMap.end()) {
						dbAssignment = this->_dbData->assignmentNameMap[assignment];
					}

					// 2024.2.1 jiaxin.jin，dp的计算是从CI到CO，注释掉最后一个不是FLY的代码逻辑
					/*if (assignment != "FLY" && assignment != "OPR" && k == segments.size() - 1)
					{
						dpEnd = segments[k]->getEndTimeUtc(DP.end);
						cust_dp_end = segments[k]->getEndTimeUtc(CUST_DP.end);
						act_dpEnd = segments[k]->getEndTimeUtc(ACT_DP.end);
					}*/
					if (assignment == "PNC" || assignment == "DHD") {
						SharedPtr<mandayTimes> tempPNCDp(new mandayTimes());
						tempPNCDp->types = CALCULATION_TYPES::DHD_DP;
						tempPNCDp->start = segments[k]->getStartTimeUtc(DP.str);
						tempPNCDp->end = segments[k]->getEndTimeUtc(DP.end);
						tempPNCDp->percentage = dp_pct;
						result.push_back(tempPNCDp);
					}

					const auto& rf = this->_dbData->rosterFlightMgr.get(segments[k]->getDBId(), rosters[i]->idcrew);
					bool isIncludeInFt = true;
					bool fltSts = true;
                    if (rf != nullptr && this->_dbData->rankMap.find(rf->actingRank) != this->_dbData->rankMap.end()) {
                        isIncludeInFt = this->_dbData->rankMap[rf->actingRank].isIncludeInFt;
                    }

					fltSts = IsFlightCountedForMandayBlh(_dbData.get(), segments[k]);

					SharedPtr<mandayTimes> temp(new mandayTimes());
					temp->types = CALCULATION_TYPES::BH;
					temp->start = segments[k]->getStartTimeUtc(BH.str);
					temp->end = segments[k]->getEndTimeUtc(BH.end);
					if (segments[k]->getBlkMinHistory() > 0) {
						temp->end = temp->start + segments[k]->getBlkMinHistory() * 60;
					}
					if (k == segments.size() - 1 && j == dutiesSize - 1)
					{
						//temp->end += iBHAdj;
						temp->adjustment = iBHAdj;//mantis#4329, 计算规则 (end-start)*pct + adj
					}
					if (dbAssignment){
						temp->percentage = dbAssignment->BT_PCT;
						temp->credit_percentage = dbAssignment->CREDIT_PCT;
						if (!isIncludeInFt || !fltSts)
							temp->percentage = 0;
					}
					// eva特殊逻辑，根据数据字典判断ft的pct
					/*if (_dbData->scenario.airline == "BR") {
						const auto& rf = _dbData->rosterFlightMgr.get(segments[k]->getDBId(), _crew->idCrew);
						if (rf) {
							const auto& dictionList = this->_dbData->dictionaryMap["FT_PCT_BY_ACTING_RANK"];
							for (const auto& dic : dictionList) {
								if (rf->actingRank == dic->code) {
									if (isNumberStr(dic->name.c_str(), dic->name.length()))
										temp->percentage = stod(dic->name);
									else
										temp->percentage = 0;
								}
							}
						}
						

					}*/
					result.push_back(temp);

					string dep = segments[k]->getDepStation();
					string arv = segments[k]->getArrStation();

					// 高高原飞时计算，时长同bh
					if (assignment == "FLY" && this->_dbData->airportCodeMap.find(dep) != this->_dbData->airportCodeMap.end()
						&& this->_dbData->airportCodeMap.find(arv) != this->_dbData->airportCodeMap.end()
						&& (this->_dbData->airportCodeMap[dep]->plateauType[0] == 'H' || this->_dbData->airportCodeMap[arv]->plateauType[0] == 'H')) {
						SharedPtr<mandayTimes> temp(new mandayTimes());
						temp->types = CALCULATION_TYPES::HIGH_PLATEAU;
						temp->start = segments[k]->getStartTimeUtc(BH.str);
						temp->end = segments[k]->getEndTimeUtc(BH.end);
						if (k == segments.size() - 1 && j == dutiesSize - 1)
						{
							//temp->end += iBHAdj;
							temp->adjustment = iBHAdj;//mantis#4329, 计算规则 (end-start)*pct + adj
						}
						if (dbAssignment) {
							temp->percentage = dbAssignment->BT_PCT;
							temp->credit_percentage = dbAssignment->CREDIT_PCT;
							if (!isIncludeInFt)
								temp->percentage = 0;
						}
						result.push_back(temp);
					}

					SharedPtr<mandayTimes> tempFt(new mandayTimes());
					tempFt->types = CALCULATION_TYPES::FT;
					tempFt->start = segments[k]->getStartTimeUtc(FT.str);
					tempFt->end = segments[k]->getEndTimeUtc(FT.end);
					if (segments[k]->getBlkMinHistory() > 0) {
						tempFt->end = tempFt->start + segments[k]->getBlkMinHistory() * 60;
					}
					if (dbAssignment) {
						tempFt->percentage = dbAssignment->FT_PCT;
						tempFt->credit_percentage = dbAssignment->CREDIT_PCT;
						if (!isIncludeInFt || !fltSts)
							tempFt->percentage = 0;
					}
					if (AssignmentUtils::IsFlyAssignment(segments[k]->getAssignment(), this->_dbData)) {
						//飞行任务
						tempFt->addOperatingFleets(std::make_pair<string, int>(segments[k]->getFleetCD(), 1));
						if (rosters[i]->pairing->getBase() != segments[k]->getDepStationRead()) {
							tempFt->addOperatingDepAirports(std::make_pair<string, int>(segments[k]->getDepStation(), 1));
						}
						if (rosters[i]->pairing->getBase() != segments[k]->getArrStationRead()) {
							tempFt->addOperatingArrAirports(std::make_pair<string, int>(segments[k]->getArrStation(), 1));
						}

						//假设该机组人员均执行了起飞和降落操作，记录为1次
						tempFt->addFleetTakeoff(std::make_pair<string, int>(segments[k]->getFleetCD(), 1));
						tempFt->addFleetLanding(std::make_pair<string, int>(segments[k]->getFleetCD(), 1));

						if (SegmentUtils::IsNightTaskOff(segments[k], this->_dbData)) {
							tempFt->addNightFleetTakeoff(std::make_pair<string, int>(segments[k]->getFleetCD(), 1));
						}
						if (SegmentUtils::IsNightLanding(segments[k], this->_dbData)) {
							tempFt->addNightFleetLanding(std::make_pair<string, int>(segments[k]->getFleetCD(), 1));
						}
					}
					// eva特殊逻辑，根据数据字典判断ft的pct
					/*if (_dbData->scenario.airline == "BR") {
						const auto& rf = _dbData->rosterFlightMgr.get(segments[k]->getDBId(), _crew->idCrew);
						if (rf) {
							const auto& dictionList = this->_dbData->dictionaryMap["FT_PCT_BY_ACTING_RANK"];
							for (const auto& dic : dictionList) {
								if (rf->actingRank == dic->code) {
									if(isNumberStr(dic->name.c_str(), dic->name.length()))
										temp->percentage = stod(dic->name);
									else
										temp->percentage = 0;
								}
							}
						}
						

					}*/
					result.push_back(tempFt);

					if (!this->_dbData->getRuleFunctions(RULES::CALCULATE_FLIGHT_TIME_CUSTOM_TG).empty()) {
						// rule7006 飞时按百分比折算后计入累计飞时 jiaxin.jin
						double customFTPercent = _ruleEngine->CalculateMandayFTCustom_TG(segments[k]);
						//配置了7006， 但是没有匹配到参数，则用原始assignment的pct
						if (customFTPercent == NULL) {
							customFTPercent = dbAssignment->FT_PCT;
						}
						if (!isIncludeInFt) {
							customFTPercent = 0;
						}
						// 空则不赋值
						if (customFTPercent != NULL) {
							SharedPtr<mandayTimes> tempCustomFT(new mandayTimes());
							tempCustomFT->types = CALCULATION_TYPES::PFT;
							tempCustomFT->start = segments[k]->getStartTimeUtc(FT.str);
							tempCustomFT->end = segments[k]->getEndTimeUtc(FT.end);
							tempCustomFT->percentage = customFTPercent;
							result.push_back(tempCustomFT);
							;
						}
					}
					

					totalFt += static_cast<int>((tempFt->end - tempFt->start) * tempFt->percentage);

					//CASE 18
					if (dutiesSize == 1 && segments.size() == 1 && assignment == "PNC")
					{
						if (segments[0]->getDepStation() != base && segments[0]->getArrStation() == base)
							if (i > 0)
								if (Utility::GetInstancePtr()->isTimeOverlap(rosters[i]->actStrUtc, rosters[i]->actRestStrUtc, rosters[i - 1]->actStrUtc, rosters[i - 1]->actRestStrUtc))
								{
									if (!RuleParams::GetInstancePtr()->isRestAssignment(rosters[i - 1]->qualifier, rosters[i - 1]->duty))
									{
										if (DP.str == "SCH")
											dpStart -= (rosters[i]->strUtc - rosters[i - 1]->restStrUtc);
										else
											dpStart -= (rosters[i]->actStrUtc - rosters[i - 1]->actRestStrUtc);
										fdpStart = fdpEnd;

										if (ACT_DP.str == "SCH")
											act_dpStart -= (rosters[i]->strUtc - rosters[i - 1]->restStrUtc);
										else
											act_dpStart -= (rosters[i]->actStrUtc - rosters[i - 1]->actRestStrUtc);
										act_fdpStart = act_fdpEnd;
									}
								}
					}

					// mantis#6498, 修正PNC和SNY不列計CUST_DP, PAX和SUR要列計
					if (assignment == "PNC" || assignment == "SNY")
					{
						//long block = segments[k]->getEndTimeUtcAct() - segments[k]->getStartTimeUtcAct();
						//0003379: 扣除PNC的CUST DP计算错误
						//cust_dp_end -= block;

						//0002239: 8002 custom DP計算有誤
						//if (k == segments.size() - 1 && segments.size()>1)
						//	cust_dp_end = segments[k - 1]->getEndTimeUtcAct() + 30 * 60;

						//if (segments.size() == 1)
						//	cust_dp_end = segments[0]->getStartTimeUtc(CUST_DP.end);
						
						cust_dp_end = segments[k]->getStartTimeUtc(CUST_DP.end);
						if (segments.size() > 1)
						{
							if (cust_dp_end > cust_dp_start)
							{
								SharedPtr<mandayTimes> tempCust(new mandayTimes());
								tempCust->types = CALCULATION_TYPES::CUST_DP;
								tempCust->start = cust_dp_start;
								tempCust->end = cust_dp_end;
								result.push_back(tempCust);
								cust_dp_start = segments[k]->getEndTimeUtc(CUST_DP.str);
								cust_dp_end = dpEnd;
							}
						}
					}
					if (_dbData->scenario.airline == "BR" && (assignment == "DHD" || assignment == "PNC"))
					{
						SharedPtr<mandayTimes> temp(new mandayTimes());
						temp->types = CALCULATION_TYPES::DHD;
						temp->start = segments[k]->getStartTimeUtcAct();
						temp->end = segments[k]->getEndTimeUtcAct();
						temp->setValue = 1;
						temp->divide = divide;
						temp->credit_percentage = credit_pct;
						result.push_back(temp);
					}
					//PNC/SNY/SUR/PAX
					//0003378: 单段SNY的CUST DP计算错误
					//if (assignment == "SNY" || assignment == "SUR" || assignment == "PAX")
					//{
						//if (segments.size() == 1)
					//		cust_dp_end = segments[k]->getStartTimeUtc(CUST_DP.end);
					//}

				}

				//duty->setBLKInMins(totalFt / 60);
				rosters[i]->dutyValues.setBlk(j, totalFt / 60);//20181027 ain, mantis#4217

				//first duty overlap with previous roster
				if (j == 0 && isOverlap)
				{
					dpStart = rosters[i - 1]->getStartTimeUtc(DP.str);
					act_dpStart = rosters[i - 1]->getStartTimeUtc(ACT_DP.str);
					//CASE4 HOME STANDBY OVERLAP WITH NEXT ROSTER, ADJUST DP
					if ((isCompanySby || isGround) && lastFly)
					{
						fdpStart = rosters[i - 1]->getStartTimeUtc(FDP.str);
						act_fdpStart = rosters[i - 1]->getStartTimeUtc(ACT_FDP.str);
					}
				}

				if (j == dutiesSize - 1 && i < rosters.size() - 1)
				{
					//CASE11: last duty overlap with next ground roster
					if (Utility::GetInstancePtr()->isTimeOverlap(rosters[i]->actStrUtc, rosters[i]->actRestStrUtc, rosters[i + 1]->actStrUtc, rosters[i + 1]->actRestStrUtc))
					{
						if (this->_dbData->isAssignmentInGroup(rosters[i + 1]->duty, "GND") && rosters[i]->pairing)
						{
							//20190723 ain, mantis#6286, 容忍 ptn/duty为空
							Segment* lastSeg = rosters[i]->pairing->getLastSegment();
							string last = lastSeg ? lastSeg->getAssignment() : "";
							if (last == "OPR" || last == "PNC")
							{
								//next roster's DP/WP will be calculated in next loop
								dpEnd = rosters[i + 1]->getStartTimeUtc(DP.end);
								act_dpEnd = rosters[i + 1]->getStartTimeUtc(ACT_DP.end);
								cust_dp_end = rosters[i + 1]->getStartTimeUtc(CUST_DP.end);
							}
						}

						if (isGround && rosters[i + 1]->pairing)
						{
							if (base == rosters[i]->location)
								offsetMinutes = baseOffsetMinutes;
							else
								offsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[i]->location);
							localStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(duty->getEndTimeUtcAct(), offsetMinutes);
							if (localStart == Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i + 1]->actStrUtc, offsetMinutes))
							{
								//20190723 ain, mantis#6286, 容忍 ptn/duty为空
								Segment * firstSeg = rosters[i]->pairing->getFirstSegment();
								string first = firstSeg ? firstSeg->getAssignment() : "";
								if (first == "OPR" || first == "PNC" || first == "SEP")
								{
									dpEnd = rosters[i + 1]->getStartTimeUtc(DP.end);
									act_dpEnd = rosters[i + 1]->getStartTimeUtc(ACT_DP.end);
									cust_dp_end = rosters[i + 1]->getStartTimeUtc(CUST_DP.end);
								}
							}
						}
					}
				}
				double pct = 1.0;
				double credit_pct = 1.0;
				if (dbRosterAssignment != this->_dbData->assignmentNameMap.end() && dbRosterAssignment->second) {
					pct = dbRosterAssignment->second->FDP_PCT;
					credit_pct = dbRosterAssignment->second->CREDIT_PCT;
				}
					
				if (fdpStart < fdpEnd)
				{
					//SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					//tempFdp->types = CALCULATION_TYPES::FDP;
					//tempFdp->start = fdpStart;
					//tempFdp->end = fdpEnd;
					//result.push_back(tempFdp);
					long fdp = static_cast<long>((fdpEnd - fdpStart) * pct);
					//duty->setFDPInSecs(fdp);
					rosters[i]->dutyValues.setPlnFdp(j, fdp / 60);//20181027 ain, mantis#4217
				}

				if (this->_dbData->scenario.airline == "BR"&& act_fdpStart < act_fdpEnd)
				{
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = act_fdpStart;
					tempFdp->end = act_fdpEnd;
					tempFdp->percentage = pct; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp->credit_percentage = credit_pct;
					result.push_back(tempFdp);
					long fdp = static_cast<long>((act_fdpEnd - act_fdpStart) * pct);
					//duty->setActualFDP(fdp / 60);
					rosters[i]->dutyValues.setActFdp(j, fdp / 60);//20181027 ain, mantis#4217
				}

				if (dpStart < dpEnd)
				{
					long dp = static_cast<long>(dpEnd - dpStart);
					if (dbRosterAssignment != this->_dbData->assignmentNameMap.end() && dbRosterAssignment->second)
						dp = static_cast<long>(dp*dbRosterAssignment->second->DP_PCT);
					rosters[i]->dutyValues.setPlnDp(j, dp / 60);//20181027 ain, mantis#4217
				}

				if (act_dpStart < act_dpEnd)
				{
					if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, "SBY")) {
						SharedPtr<mandayTimes> tempSBYDp(new mandayTimes());
						tempSBYDp->types = CALCULATION_TYPES::SBY_DP;
						tempSBYDp->start = act_dpStart;
						tempSBYDp->end = act_dpEnd;
						tempSBYDp->percentage = dp_pct;
						result.push_back(tempSBYDp);
					}
					SharedPtr<mandayTimes> tempDp(new mandayTimes());
					tempDp->types = CALCULATION_TYPES::DP;
					tempDp->start = act_dpStart;
					tempDp->end = act_dpEnd;
					if (dbRosterAssignment != this->_dbData->assignmentNameMap.end() && dbRosterAssignment->second) {
						tempDp->percentage = dbRosterAssignment->second->DP_PCT;
						tempDp->credit_percentage = dbRosterAssignment->second->CREDIT_PCT;
						tempDp->dp_gap = dbRosterAssignment->second->DP_GAP;
						tempDp->beforePct = dbRosterAssignment->second->before_pct_dp_gap;
						tempDp->afterPct = dbRosterAssignment->second->after_pct_dp_gap;
					}
					for (const auto& seg : duty->getSegmentsRead()) {
						const auto& dbSegAssignment = _dbData->assignmentNameMap.find(seg->getAssignment());
						if (dbSegAssignment == _dbData->assignmentNameMap.end())
							continue;

						if (Utility::GetInstancePtr()->checkCoverdDPGapTimeRange(seg->getStartTimeLocAct(), seg->getEndTimeLocAct(), _dbData.get())) {
							tempDp->dp_gap += dbSegAssignment->second->DP_GAP;
						}
					}
					
					long dp_adjust = 0;
					if (i != rosters.size() - 1) {
						dp_adjust = CalculateDPForPR(duty, rosters[i], rosters[i + 1], beforeIsCallout, this->_dbData);
					}
					else {
						bool b = true;
						dp_adjust = CalculateDPForPR(duty, rosters[i], nullptr, b, this->_dbData);
					}
					tempDp->adjust_for_pr = dp_adjust;
					long dutyDpAdjust = 0;
					auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
					if (!dpDefinition.dpAssignments.empty()) {
						for (const auto& seg : duty->getSegmentsRead()) {
							if (dpDefinition.matchSegment(seg)) {
								dutyDpAdjust += static_cast<long>(seg->getBlkMinutes() * 60 * dpDefinition.dpPct);
							}
						}
					}
					long dp = static_cast<long>((act_dpEnd - act_dpStart + dp_adjust) * tempDp->percentage) + dutyDpAdjust;
					
					long tgDP = 0;
					if (i != rosters.size() - 1) {
						tgDP = _ruleEngine->CalculateStandbyDP_TG(rosters[i], rosters[i + 1]);
					}
					else {
						tgDP = _ruleEngine->CalculateStandbyDP_TG(rosters[i], nullptr);
					}
					if (tgDP > 0) {
						dp = tgDP;
						tempDp->end = act_dpStart + dp;
						tempDp->percentage = 1.0;
						tempDp->beforePct = 0;
						tempDp->dp_gap = 0;
						tempDp->afterPct = 0;
					}

					long hxDp = -1;
					if (i != rosters.size() - 1 && j == rosters[i]->pairing->getDutyVec().size() - 1) {
						hxDp = CalculateDPForHX(rosters[i], rosters[i + 1]);
					}
					if (hxDp >= 0) {
						dp = hxDp * 60;
						tempDp->end = act_dpStart + dp;
						tempDp->percentage = 1.0;
						tempDp->beforePct = 0;
						tempDp->dp_gap = 0;
						tempDp->afterPct = 0;
					}

					const bool skipCallOutRosterFirstDuty = rosters[i]->isCallOutRoster && j == 0 && hxDp < 0;
					if (!skipCallOutRosterFirstDuty) {
						duty->setActualDP(dp / 60);
					}
					bool setDutyDp = true;
					if ((i != 0 && BeforeIsCallout(rosters[i - 1], rosters[i]) || (i != rosters.size() - 1 && BeforeIsCallout(rosters[i], rosters[i + 1]))))
						setDutyDp = false;
					if (skipCallOutRosterFirstDuty)
						setDutyDp = false;
					if (setDutyDp) {
						rosters[i]->dutyValues.setActDp(j, dp / 60);//20181027 ain, mantis#4217
					}

					//ROSCRW-2629,QQ对DP的manday进行reduce
					int longTransitRest = RuleParams::GetInstancePtr()->getLongTransitRest(duty->getSegments());
					int newDP = 0;
					if (longTransitRest > 0) {
						newDP = _ruleEngine->getDutyDPManday(duty);
					}
					if (newDP > 0) {
						tempDp->end = act_fdpStart + newDP * 60;
					}
					result.push_back(tempDp);
				}

				if (cust_dp_start + 30 * 60 < cust_dp_end && rosters[i]->duty != "RB")
				{
					SharedPtr<mandayTimes> tempCust(new mandayTimes());
					tempCust->types = CALCULATION_TYPES::CUST_DP;
					tempCust->start = cust_dp_start;
					tempCust->end = cust_dp_end;
					result.push_back(tempCust);
				}

			}
			resultAll.insert(resultAll.end(), result.begin(), result.end());
			if (rosters[i]->pairing) {
				rosters[i]->pairing->setMandyOtherTimes(std::move(result));
				
			}

		}
		// mantis#6303, EVA在前面的邏輯判斷完成後再初始化
		if (isAirlineBR)
		{
			isOverlap = false, isHomeSby = false, isCompanySby = false, isGround = false, isPncBackToBase = false;
		}
	}
	// 汇总roster->dpMinutes
	for (const auto& roster : rosters) {
		int dpMinutes = 0;
		if (roster->pairing) {
			for (size_t i = 0; i < roster->pairing->getDutyVec().size(); i++)
			{
				dpMinutes += roster->dutyValues.getActDp(i);
			}
		}
		else {
			dpMinutes += roster->dutyValues.getActDp(0);
		}
		roster->dpMinutes = dpMinutes;
	}
	return resultAll;
}

//检测两个roster之间休息是否足够
bool isMergeTwoRosterOk(vector<SharedPtr<ROSTER>>& rosters,int f, SharedPtr<CrewDataContext> _dbData){
	if (f + 1 >= (int)rosters.size()){
		return false;
	}
	return isMergeTwoRosterOk(rosters[f], rosters[f + 1], _dbData);
}
bool isMergeTwoRosterOk(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster, SharedPtr<CrewDataContext> _dbData) {
	if (!roster || !nextRoster) {
		return false;
	}
	const auto & merge = matchRoster8107RuleParam(roster, nextRoster, "FDP", _dbData.get());
	if (!merge.isMergeFdp)
		return false;
	int res;
	if (roster->pairId == 0) {
		res = static_cast<int>(roster->getEndTimeUtcAct() - roster->getRestStartUtcAct());
	}
	else {
		res = roster->pairing->getLastDuty()->getMinRest() * 60;
	}
	if (res > static_cast<int>(nextRoster->getStartTimeUtcAct() - roster->getRestStartUtcAct()))return true;
	return false;


}

long CalculateDPForPR(Duty* duty, SharedPtr<ROSTER> prevRoster, SharedPtr<ROSTER> roster, bool & beforeIsCallout, SharedPtr<CrewDataContext> dbData) {
	double dp = 0;
	time_t dutyEnd = 0;
	string assignment = "";
	if (duty) {
		dutyEnd = duty->getEndTimeUtcAct();
		assignment = duty->getAssignment();
	}
	else {
		dutyEnd = prevRoster->getRestStartUtcAct();
		assignment = prevRoster->qualifier;
	}

	auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
	if (duty && !dpDefinition.dpAssignments.empty()) {
		for (const auto& seg : duty->getSegmentsRead()) {
			if (dpDefinition.matchSegment(seg)) {
				dp += seg->getBlkMinutes() * 60 * dpDefinition.dpPct;
			}
		}
	}
	if (!dpDefinition.calloutAssignments.empty()) {
		if (!roster || dutyEnd < roster->getStartTimeUtcAct())
			return 0;
		if (roster && dpDefinition.matchCalloutAssignment(assignment)) {
			if (roster->qualifier != "FLY")
				return 0;
			dp = (double)(roster->getStartTimeUtcAct() - dutyEnd);
			beforeIsCallout = true;
		}
		else {
			beforeIsCallout = false;
		}
	}
	return (long)dp;
}

void CalculateDPForPR(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& nextRoster , SharedPtr<CrewDataContext> dbData) {
	if (!prevRoster)
		return;
	auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
	if (prevRoster->pairId != 0 && prevRoster->pairing) {
		for (size_t j = 0; j < prevRoster->pairing->getDutyVec().size(); ++j) {
			auto duty = prevRoster->pairing->getDuty(j);
			if (!duty)
				continue;
			string assignment = duty->getAssignment();
			if (!dpDefinition.dpAssignments.empty()) {
				for (const auto& seg : duty->getSegmentsRead()) {
					if (dpDefinition.matchSegment(seg)) {
						int dp = prevRoster->dutyValues.getActDp(j);
						dp = NumberUtils::Ceil(dp + seg->getBlkMinutes() * dpDefinition.dpPct);
						prevRoster->dutyValues.setActDp(j, dp);
						//prevRoster->dpMinutes += NumberUtils::Ceil(seg->getBlkMinutes() * dpDefinition.dpPct);
					}
				}
			}
			if (nextRoster && !dpDefinition.calloutAssignments.empty()) {
				
				if (dpDefinition.matchCalloutAssignment(assignment) && duty->getEndTimeUtcAct() >= nextRoster->getStartTimeUtcAct()) {
					if (nextRoster->qualifier != "FLY")
						continue;
					prevRoster->dutyValues.setActDp(j, 0);
					prevRoster->dpMinutes = 0;
					const auto& nextDutyEnd = nextRoster->pairing->getFirstDuty()->getEndTimeUtcAct();
					const auto& nextDutyStart = nextRoster->pairing->getFirstDuty()->getStartTimeUtcAct();
					int dp = nextDutyEnd - duty->getStartTimeUtcAct();
					int dpAdjust = nextDutyStart - duty->getStartTimeUtcAct();
					nextRoster->dutyValues.setActDp(0, dp / 60);
					nextRoster->dpMinutes = (nextRoster->pairing->getDPInSec() + dpAdjust) / 60;
				}
			}
		}
			
	}
	else {
		string assignment = prevRoster->qualifier;
		if (!dpDefinition.calloutAssignments.empty()) {
			if (nextRoster && dpDefinition.matchCalloutAssignment(assignment) && prevRoster->getRestStartUtcAct() >= nextRoster->getStartTimeUtcAct()) {
				if (nextRoster->qualifier != "FLY")
					return;
				prevRoster->dpMinutes = 0;
				const auto& nextDutyEnd = nextRoster->pairing->getFirstDuty()->getEndTimeUtcAct();
				const auto& nextDutyStart = nextRoster->pairing->getFirstDuty()->getStartTimeUtcAct();
				int dp = nextDutyEnd - prevRoster->getStartTimeUtcAct();
				int dpAdjust = nextDutyStart - prevRoster->getStartTimeUtcAct();
				nextRoster->dpMinutes = (nextRoster->pairing->getDPInSec() + dpAdjust) / 60;
				int firstDutyDp = (nextRoster->pairing->getDuty(0)->getEndTimeUtcAct() - prevRoster->getStartTimeUtcAct()) / 60;
				nextRoster->dutyValues.setActDp(0, firstDutyDp);
			}
		}
	}

}

bool BeforeIsCallout(const SharedPtr<ROSTER>& preRoster, const SharedPtr<ROSTER>& currRoster) {
	if (!preRoster || !currRoster)
		return false;
	string assignment = preRoster->qualifier;

	if (preRoster->pairing) {
		const auto& duty = preRoster->pairing->getLastDuty();
		if (duty)
			assignment = duty->getAssignment();
	}
	auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
	if (!dpDefinition.calloutAssignments.empty()) {
		if (dpDefinition.matchCalloutAssignment(assignment) && preRoster->getRestStartUtcAct() >= currRoster->getStartTimeUtcAct()) {
			if (currRoster->qualifier != "FLY")
				return false;
			return true;
		}
	}
	return false;

}

void CalculateFDPAndDPForHX(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& currRoster) {
	if (!currRoster->pairing)
		return;
	auto& standbyFDPAndRestDefinitions = RuleParams::GetInstancePtr()->getStandbyFDPAndRestDefinitions();
	for (auto& standbyFDPAndRestDefinition : standbyFDPAndRestDefinitions) {
		if (!standbyFDPAndRestDefinition->match(prevRoster.get(), currRoster.get())) {
			continue;
		}
		
		if (standbyFDPAndRestDefinition->actualFdpCalcStart == "STANDBYDUTYSTART") {
			auto duty = currRoster->pairing->getFirstDuty();
			int addFdp = (duty->getFDPStartUtcTimes() - prevRoster->getStartTimeUtcAct()) / 60;
			int currFdp = duty->getActualFDP();
			duty->setActualFDP(currFdp + addFdp);
		}

		if (standbyFDPAndRestDefinition->actualDpCalcStart == "STANDBYDUTYSTART") {
			auto duty = currRoster->pairing->getFirstDuty();
			int addDp = (duty->getStartTimeUtcAct() - prevRoster->getStartTimeUtcAct()) / 60;
			int currDp = duty->getActualDP();
			duty->setActualDP(currDp + addDp);
		}
	}
}

int CalculateDPForHX(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& currRoster) {
	if (!prevRoster || !currRoster || !currRoster->pairing)
		return -1;
	int dp = -1;
	auto& standbyFDPAndRestDefinitions = RuleParams::GetInstancePtr()->getStandbyFDPAndRestDefinitions();
	for (auto& standbyFDPAndRestDefinition : standbyFDPAndRestDefinitions) {
		if (!standbyFDPAndRestDefinition->match(prevRoster.get(), currRoster.get())) {
			continue;
		}

		auto duty = currRoster->pairing->getFirstDuty();
		if (!duty) {
			continue;
		}

		if (standbyFDPAndRestDefinition->actualDpCalcStart == "STANDBYDUTYSTART") {
			const time_t dpStart = GetPrevRosterDPStartForHX(prevRoster.get());
			const int currDp = max(0, static_cast<int>((duty->getEndTimeUtcAct() - dpStart) / 60));
			duty->setActualDP(currDp);
			currRoster->dutyValues.setActDp(0, currDp);
			currRoster->dpMinutes = currDp;
			currRoster->isCallOutRoster = true;
			SetRosterDPForHX(prevRoster, 0);
			dp = 0;
			break;
		}

		if (standbyFDPAndRestDefinition->actualDpCalcStart == "DUTYSTART") {
			const time_t dpStart = GetPrevRosterDPStartForHX(prevRoster.get());
			const time_t dpEnd = prevRoster->calloutUtc;
			int prevDp = max(0, static_cast<int>((dpEnd - dpStart) / 60));
			prevDp = ApplyStandbyDPDefinitionForHX(prevRoster, dpStart, dpEnd, prevDp);
			SetRosterDPForHX(prevRoster, prevDp);
			dp = prevDp;
			break;
		}
	}
	return dp;
}

time_t GetFDPStartByStandbyDefinitionForHX(SharedPtr<ROSTER>& prevRoster, SharedPtr<ROSTER>& currRoster, time_t originalStartTime, const string type) {
	time_t result = originalStartTime;
	auto& standbyFDPAndRestDefinitions = RuleParams::GetInstancePtr()->getStandbyFDPAndRestDefinitions();
	for (auto& standbyFDPAndRestDefinition : standbyFDPAndRestDefinitions) {
		if (!standbyFDPAndRestDefinition->match(prevRoster.get(), currRoster.get())) {
			continue;
		}

		if (type == "FDP" && standbyFDPAndRestDefinition->actualFdpCalcStart == "STANDBYDUTYSTART") {
			originalStartTime = prevRoster->getStartTimeUtcAct();
		}

		if (type == "DP" && standbyFDPAndRestDefinition->actualDpCalcStart == "STANDBYDUTYSTART") {
			originalStartTime = prevRoster->getStartTimeUtcAct();

		}
	}
	return originalStartTime;
}

vector<SharedPtr<mandayTimes>> BasicCalculation::getCrewManDayDpTimes(vector<SharedPtr<ROSTER>>& rosterList, bool setCalculated) {
	vector<SharedPtr<mandayTimes>>  result;
	vector<SharedPtr<ROSTER>> rosters;
	if (this->_dbData->scenario.airline == "BR") {
		return result;
	}
	if (rosterList.size() > 0)
		rosters = rosterList;
	else
		rosters = _crew->rosterList;

	std::size_t mandayEstimate = 0;
	for (const auto &roster : rosters) {
		if (roster->pairing) {
			if (roster->pairing->isMandayOtherCalculated())
				mandayEstimate += roster->pairing->getMandayOtherTimes().size();
			else
				mandayEstimate += (roster->pairing->getSegmentsRead().size() + roster->pairing->getNumDuties() * 4);
		}
		else
			mandayEstimate++;
	}
	result.reserve(mandayEstimate);

	for (int i = 0; i < (int)rosters.size(); ++i) {
		
		//新合并执勤期逻辑
		tryToMergeDp(rosters, result, i);
	}

	//合并 清理冗余数据
	vector<SharedPtr<mandayTimes>>  resultCopy;
	if (result.size() > 0) {
		SharedPtr<mandayTimes> tempFdp1(new mandayTimes());
		tempFdp1->types = CALCULATION_TYPES::DP;
		tempFdp1->start = result[0]->start;
		tempFdp1->end = result[0]->end;
		tempFdp1->percentage = 1.0;
		resultCopy.push_back(tempFdp1);
		int resSize = (int)result.size();
		int i = 1, j = 0;
		while (i < resSize) {
			if (result[i]->start <= resultCopy[j]->end) {
				// 有重叠或紧密衔接，合并成一条数据
				if (result[i]->end > resultCopy[j]->end) {
					resultCopy[j]->end = result[i]->end;
				}
				i++;
			}
			else {
				SharedPtr<mandayTimes> tempFdp(new mandayTimes());
				tempFdp->types = CALCULATION_TYPES::DP;
				tempFdp->start = result[i]->start;
				tempFdp->end = result[i]->end;
				tempFdp->percentage = 1.0;
				resultCopy.push_back(tempFdp);
				i++;
				j++;
			}
		}
	}
	return resultCopy;
}

vector<SharedPtr<mandayTimes>> BasicCalculation::getCrewManDayFdpTimes(vector<SharedPtr<ROSTER>>& rosterList, bool setCalculated){
	vector<SharedPtr<mandayTimes>>  result;
	vector<SharedPtr<ROSTER>> rosters;
	if (this->_dbData->scenario.airline == "BR"){
		return result;
	}
	if (rosterList.size() > 0)
		rosters = rosterList;
	else
		rosters = _crew->rosterList;

	std::size_t mandayEstimate = 0;
	for (const auto &roster : rosters) {
		if (roster->pairing) {
			if (roster->pairing->isMandayOtherCalculated())
				mandayEstimate += roster->pairing->getMandayOtherTimes().size();
			else
				mandayEstimate += (roster->pairing->getSegmentsRead().size() + roster->pairing->getNumDuties() * 4);
		}
		else
			mandayEstimate++;
	}
	result.reserve(mandayEstimate);

	//20191011 ain,mantis#6859, 问题1, 先清空 mergeFdp
	for (auto& roster : rosters) {
		roster->dutyValues.clearMergeFdp();
		roster->isMergeFdpWithBefore = false;
		roster->isMergeFdpWithNext = false;
		roster->isMergeFdpWithFly = false;
		roster->mergeFdpAssignment = "";

		roster->isMergeDpWithBefore = false;
		roster->isMergeDpWithNext = false;
		roster->mergeDpBeforeRosterId = 0;
		roster->mergeDpNextRosterId = 0;
	}
	auto& rules = _dbData->getRuleFunctions(RULES::ROSTER_FDP_MERGE);

	long preRosterMergeFDP = 0;
	for (int i = 0; i < (int)rosters.size(); ++i)
	{	
		//if (rosters[i]->rosterId == 21268086) {
		//	printf("1");
		//}
		long nowRosterMergeFDP = 0;
		long tmpMergeFdp = 0;
		Pairing* pairing = rosters[i]->pairing;
		string pairingAssignment = pairing ? pairing->getPrimeActivity() : "FLY";
		//vector<SharedPtr<mandayTimes>> result;
		/*map<string, SharedPtr<ASSIGNMENT>>::iterator dbPairingAssignment = this->_dbData->assignmentNameMap.find(pairingAssignment);
		float fdpPct_p = (dbPairingAssignment != this->_dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->FDP_PCT : 1;*/

		const auto& actingRank = rosters[i]->actingRank;
		bool isIncludeInFt = true;
		if (this->_dbData->rankMap.find(actingRank) != this->_dbData->rankMap.end()) {
			isIncludeInFt = this->_dbData->rankMap[actingRank].isIncludeInFt;
		}

		//20191003 ain, 常规fdp按roster.pairId != 0判断是否计算，而合并FDP按前后休息是否充足判断
		if (rosters[i]->pairId != 0 && rosters[i]->pairing && isIncludeInFt) {
			if (rosters[i]->pairing->isMandayFDPCalculated() == false) {
				// calculate manday and FDP
				vector<SharedPtr<mandayTimes>>  pairingResult;
				pairingResult.reserve(rosters[i]->pairing->getSegmentsRead().size() + rosters[i]->pairing->getNumDuties() * 4); // manday count ~= number of segment + number of duty nodes (2-4+ per duty) + possible inter-segment

				for (int j = 0; j < (int)rosters[i]->pairing->getNumDuties(); j++)
				{
					Duty* duty = rosters[i]->pairing->getDuty(j);
					if (!duty) {
						continue;
					}

					long fdpStart = 0, fdpEnd = 0;
					long fdp = 0;
					const vector<Segment*>& Segments = duty->getSegments();
					bool isFerry = true;
					for (int i = 0; i < (int)Segments.size(); i++) {
						map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = this->_dbData->assignmentNameMap.find(Segments[i]->getAssignment());
						if (segAssignment != this->_dbData->assignmentNameMap.end() && segAssignment->second && segAssignment->second->FDP_PCT > 0) {
							isFerry = false;
							break;
						}
					}
					if (!isFerry) {
						fdp = getCrewManDayAndFlightDutyPeriod(rosters[i], j, pairingResult);
						if (j == 0) {
							nowRosterMergeFDP = fdp;
						}
						if (j == rosters[i]->pairing->getNumDuties() - 1) {
							tmpMergeFdp = fdp;
						}
					}
					else {
						if (j == 0) {
							nowRosterMergeFDP = getCrewManDayAndFerryDutyPeriod(rosters[i], j, pairingResult);
						}
						if (j == rosters[i]->pairing->getNumDuties() - 1) {
							tmpMergeFdp = getCrewManDayAndFerryDutyPeriod(rosters[i], j, pairingResult);
						}
					}
				}
				pairingResult.shrink_to_fit();
				result.insert(result.end(), pairingResult.begin(), pairingResult.end());
				rosters[i]->pairing->setMandyFDPTimes(std::move(pairingResult));
			}
			else {
				// get FDP from cache
				const auto& manday = rosters[i]->pairing->getMandayFDPTimes();
				result.insert(result.end(), manday.begin(), manday.end());
			}
		}
		else {
			nowRosterMergeFDP = static_cast<long>(rosters[i]->getRestStartUtcAct() - rosters[i]->getStartTimeUtcAct());
			tmpMergeFdp = nowRosterMergeFDP;
		}

		//新合并执勤期逻辑
		tryToMergeFdp(rosters, result, i);

		preRosterMergeFDP = tmpMergeFdp;
		
		
	}

	

	//合并 清理冗余数据
	vector<SharedPtr<mandayTimes>>  resultCopy;
	if (result.size() > 0){
		SharedPtr<mandayTimes> tempFdp1(new mandayTimes());
		tempFdp1->types = CALCULATION_TYPES::FDP;
		tempFdp1->start = result[0]->start;
		tempFdp1->end = result[0]->end;
		tempFdp1->percentage = 1.0;
		resultCopy.push_back(tempFdp1);
		int resSize = (int)result.size();
		int i = 1, j = 0;
		while (i < resSize){
			if (result[i]->start == resultCopy[j]->end){
				resultCopy[j]->end = result[i]->end;
				i++;
			}
			else{
				SharedPtr<mandayTimes> tempFdp(new mandayTimes());
				tempFdp->types = CALCULATION_TYPES::FDP;
				tempFdp->start = result[i]->start;
				tempFdp->end = result[i]->end;
				tempFdp->percentage = 1.0;
				resultCopy.push_back(tempFdp);
				i++;
				j++;
			}
		}
	}
	return resultCopy;
}

void BasicCalculation::tryToMergeFdp(vector<SharedPtr<ROSTER>>& rosters, vector<SharedPtr<mandayTimes>>&  result, int i) {


		if (i > 0) {
			SharedPtr<ROSTER>& preRoster = rosters[i - 1];
			SharedPtr<ROSTER>& nowRoster = rosters[i];


			long preRosterBlh = getDutyBlh(preRoster, (int)preRoster->getDutyNums() - 1);
			long nowRosterBlh = getDutyBlh(nowRoster, 0);
			long preRosterMergeFDP = getDutyFdp(preRoster, (int)preRoster->getDutyNums() - 1);
			long nowRosterMergeFDP = getDutyFdp(nowRoster, 0);

			///TEST
			{
				//if (preRoster->idcrew == "bjjiangzhaojing" && nowRoster->pairId == 4239470) {
				//	cout << "**DBG 8107 pre pg=" << preRoster->pairId << endl;
				//	cout << "**DBG 8107 now pg=" << nowRoster->pairId << endl;
				//	cout << endl;
				//}
			}
			//bool needMerge = isRosterMatch8107(preRoster, nowRoster, _dbData.get());//20191017 ain, mantis#6893, 整理8107代码单独封装入rule8107.cpp
			rule8107 mergeRule = matchRoster8107RuleParam(preRoster, nowRoster, "FDP", _dbData.get());
			if (!mergeRule.mergeFdpLogic.empty() && mergeRule.isMergeFdp) {
				time_t  rest = 0, r1start = 0, r1end = 0, r2start = 0, r2end = 0;;
				if (preRoster->pairId == 0) {
					rest = preRoster->getEndTimeUtcAct() - preRoster->getRestStartUtcAct();
				}
				else {
					rest = preRoster->pairing->getLastDuty()->getActualRest() * 60;
				}
				r1start = preRoster->getStartTimeUtcAct();
				r1end = preRoster->getRestStartUtcAct();
				r2start = nowRoster->getStartTimeUtcAct();
				r2end = nowRoster->getRestStartUtcAct();
				//rest不够 可合并
				if (r2start - r1end < rest) {
					//prevRoster是否包含FDP，true包含FDP，false不包含FDP
					bool prevRosterIncludeFDP = preRoster->pairing ? (preRoster->pairing->getFDPInSec() > 0) : false;
					//nextRoster是否包含FDP，true包含FDP，false不包含FDP
					bool nextRosterIncludeFDP = nowRoster->pairing ? (nowRoster->pairing->getFDPInSec() > 0) : false;
					if (!prevRosterIncludeFDP && !nextRosterIncludeFDP) {
						return;
					}
					long preFdp = 0;
					long nowFdp = 0;
					long extFdp = 0;
					bool hasFly = false;
					string mergeAssignment;
					if (!prevRosterIncludeFDP || !nextRosterIncludeFDP) {
						if (!prevRosterIncludeFDP) {
							preFdp += static_cast<long>(r2start - r1start);
						}
						else {
							preFdp += preRosterMergeFDP;
							mergeAssignment = preRoster->duty;
							hasFly = true;
						}
						if (!nextRosterIncludeFDP) {
							nowFdp += static_cast<long>(r2end - r1end);
						}
						else {
							SharedPtr<mandayTimes> tempFdp(new mandayTimes());
							tempFdp->types = CALCULATION_TYPES::FDP;
							tempFdp->start = r1start;
							tempFdp->end = r2start;
							tempFdp->percentage = 1.0;
							tempFdp->credit_percentage = 1.0;
							result.push_back(tempFdp);
							nowFdp += nowRosterMergeFDP;
							mergeAssignment = nowRoster->duty;
							hasFly = true;
						}
					}
					else {
						if (preRoster->duty != "MVP" || RuleParams::GetInstancePtr()->bPreFerryCount || RuleParams::GetInstancePtr()->bIncludePreSBY || RuleParams::GetInstancePtr()->bIncludePreGround) {
							preFdp += preRosterMergeFDP;
							if (preRoster->duty != "MVP") {
								hasFly = true;
							}
						}
						if (nowRoster->duty != "MVP" || RuleParams::GetInstancePtr()->bIncludeLastDHD || RuleParams::GetInstancePtr()->bIncludePostSBY || RuleParams::GetInstancePtr()->bIncludePostGround) {
							nowFdp += nowRosterMergeFDP;
							if (nowRoster->duty != "MVP") {
								hasFly = true;
								if (preRoster->duty == "MVP") {
									SharedPtr<mandayTimes> tempFdp(new mandayTimes());
									tempFdp->types = CALCULATION_TYPES::FDP;
									tempFdp->start = r1start;
									tempFdp->end = r1start + preRosterMergeFDP;
									tempFdp->percentage = 1.0;
									tempFdp->credit_percentage = 1.0;
									result.push_back(tempFdp);
								}
							}
						}
						if (preFdp + nowFdp == preRosterMergeFDP + nowRosterMergeFDP) {

							Duty *preDuty = preRoster->pairing->getLastDuty();
							Duty *nextDuty = nowRoster->pairing->getFirstDuty();
							Segment *seg1 = preDuty->getLastSegment();
							Segment *seg2 = nextDuty->getFirstSegment();
							long coTime = preDuty->getLastDebrief() ? static_cast<long>(preDuty->getLastDebrief()->getEndLoc() - preDuty->getLastDebrief()->getStartLoc()) : preDuty->getActualDebriefMin() * 60;
							long ciTime = nextDuty->getFirstBreif() ? static_cast<long>(nextDuty->getFirstBreif()->getEndLoc() - nextDuty->getFirstBreif()->getStartLoc()) : nextDuty->getActualBriefMin() * 60;
							//合并执勤期添加Debrief
							if (!RuleParams::GetInstancePtr()->bIncludeCO && RuleParams::GetInstancePtr()->bIncludeLongTransitCO && coTime != 0) {
								preFdp += coTime;
								extFdp += coTime;
								SharedPtr<mandayTimes> tempFdp(new mandayTimes());
								tempFdp->types = CALCULATION_TYPES::FDP;
								tempFdp->start = r1end;
								tempFdp->end = r1end + coTime;
								tempFdp->percentage = 1.0;
								tempFdp->credit_percentage = 1.0;
								result.push_back(tempFdp);
							}
							if (mergeRule.mergeFdpLogic == "DUTYSTART") {
								long gapTime = static_cast<long>(nowRoster->getStartTimeUtcAct() - preRoster->getEndTimeUtcAct());
								if (gapTime > 0) {
									preFdp += gapTime;
									extFdp += gapTime;
									SharedPtr<mandayTimes> tempFdp(new mandayTimes());
									tempFdp->types = CALCULATION_TYPES::FDP;
									tempFdp->start = preRoster->getEndTimeUtcAct();
									tempFdp->end = nowRoster->getStartTimeUtcAct();
									tempFdp->percentage = 1.0;
									tempFdp->credit_percentage = 1.0;
									result.push_back(tempFdp);
								}
							}
						}
					}
					bool isPreMergeFdpWithBefore = preRoster->isMergeFdpWithBefore;
					bool isNowMergeFdpWithNext = nowRoster->isMergeFdpWithNext;

					preRoster->isMergeFdpWithNext = true;
					nowRoster->isMergeFdpWithBefore = true;
					if (!isPreMergeFdpWithBefore && !isNowMergeFdpWithNext) {
						if (preRoster->getDutyNums() > 0) {
							preRoster->dutyValues.setMergeFdp((int)preRoster->getDutyNums() - 1, (nowFdp + preFdp) / 60);
							preRoster->dutyValues.setMergeBlh((int)preRoster->getDutyNums() - 1, (preRosterBlh + nowRosterBlh) / 60);
						}
						else {
							preRoster->dutyValues.setMergeFdp(0, (nowFdp + preFdp) / 60);
							preRoster->dutyValues.setMergeBlh(0, (preRosterBlh + nowRosterBlh) / 60);
						}
						nowRoster->dutyValues.setMergeFdp(0, (nowFdp + preFdp) / 60);
						nowRoster->dutyValues.setMergeBlh(0, (preRosterBlh + nowRosterBlh) / 60);
						if (hasFly) {
							preRoster->isMergeFdpWithFly = true;
							preRoster->mergeFdpAssignment = mergeAssignment;
							nowRoster->isMergeFdpWithFly = true;
							nowRoster->mergeFdpAssignment = mergeAssignment;
						}
						tryToMergeFdp(rosters, result, i - 1);
					}
					if(isPreMergeFdpWithBefore){
						int size = preRoster->getDutyNums() == 0 ? 0 : (int)preRoster->getDutyNums() - 1;
						long value = preRoster->dutyValues.getMergeFdp(size) + (nowFdp + extFdp) / 60;
						long blhValue = preRoster->dutyValues.getMergeBlh(size) + (preRosterBlh + nowRosterBlh) / 60;
						int f = i - 1;
						while (f >= 0 && rosters[f]->isMergeFdpWithBefore && isMergeTwoRosterOk(rosters, f, _dbData)) { //20200429 ain, mantis#8221, f >= 0, to avoid except OutOfRange 

							if (rosters[f]->getDutyNums() > 0) {
								rosters[f]->dutyValues.setMergeFdp((int)rosters[f]->getDutyNums() - 1, value);
								rosters[f]->dutyValues.setMergeBlh((int)rosters[f]->getDutyNums() - 1, blhValue);
							}
							else {
								rosters[f]->dutyValues.setMergeFdp(0, value);
								rosters[f]->dutyValues.setMergeBlh(0, blhValue);
							}

							if (rosters[f]->getDutyNums() == 0 || rosters[f]->getDutyNums() == 1) {
								f--;
							}
							else {
								break;
							}
						}
						f = i - 1;
						while (f >= 0 && rosters[f]->isMergeFdpWithBefore) { //20200429 ain, mantis#8221, f >= 0, to avoid except OutOfRange 
							if (preRoster->getDutyNums() <= 1 && isMergeTwoRosterOk(rosters, f, _dbData))
							{
								f--;
								if (hasFly && f >= 0 && (!(rosters[f]->pairing) || rosters[f]->duty == "MVP")) {
									rosters[f]->isMergeFdpWithFly = true;
									rosters[f]->mergeFdpAssignment = mergeAssignment;
									SharedPtr<mandayTimes> tempFdp(new mandayTimes());
									tempFdp->types = CALCULATION_TYPES::FDP;
									tempFdp->start = rosters[f]->getStartTimeUtcAct();
									tempFdp->end = rosters[f]->getRestStartUtcAct();
									tempFdp->percentage = 1.0;
									tempFdp->credit_percentage = 1.0;
									result.push_back(tempFdp);
								}
							}
							else
							{
								break;
							}
						}
						if (hasFly) {
							nowRoster->isMergeFdpWithFly = true;
							nowRoster->mergeFdpAssignment = mergeAssignment;
						}
						nowRoster->dutyValues.setMergeFdp(0, value);
						nowRoster->dutyValues.setMergeBlh(0, blhValue);
					}
					if(isNowMergeFdpWithNext) {
						int size = nowRoster->getDutyNums() == 0 ? 0 : (int)nowRoster->getDutyNums() - 1;
						long value = nowRoster->dutyValues.getMergeFdp(0) + preFdp / 60;
						long blhValue = nowRoster->dutyValues.getMergeBlh(0) + preRosterBlh / 60;
						nowRoster->dutyValues.setMergeFdp(0, value);
						nowRoster->dutyValues.setMergeBlh(0, blhValue);
						if (size == 0) {
							int f = i;
							while (f + 1 < (int)rosters.size() && rosters[f]->isMergeFdpWithNext && isMergeTwoRosterOk(rosters, f, _dbData)) { //20200429 ain, mantis#8221, f >= 0, to avoid except OutOfRange 
								rosters[f + 1]->dutyValues.setMergeFdp(0, value);
								rosters[f + 1]->dutyValues.setMergeBlh(0, blhValue);
								if (rosters[f + 1]->getDutyNums() == 0 || rosters[f + 1]->getDutyNums() == 1) {
									f++;
								}
								else {
									break;
								}
							}
						}
						if (hasFly) {
							preRoster->isMergeFdpWithFly = true;
							preRoster->mergeFdpAssignment = mergeAssignment;
						}
						preRoster->dutyValues.setMergeFdp((int)preRoster->getDutyNums() - 1, value);
						preRoster->dutyValues.setMergeBlh((int)preRoster->getDutyNums() - 1, blhValue);
					}
				}
			}
		}
	}

void BasicCalculation::tryToMergeDp(vector<SharedPtr<ROSTER>>& rosters, vector<SharedPtr<mandayTimes>>& result, int i) {

	if (i > 0) {
		SharedPtr<ROSTER>& preRoster = rosters[i - 1];
		SharedPtr<ROSTER>& nowRoster = rosters[i];

		// prevRoster是否包含DP，true包含DP，false不包含DP
		double prevRosterIncludeDP = getDutyAssignmentDpPct(preRoster, (int)preRoster->getDutyNums() - 1);

		rule8107 mergeRule = matchRoster8107RuleParam(preRoster, nowRoster, "DP", _dbData.get());
		if (!mergeRule.mergeDpLogic.empty() && mergeRule.isMergeDp && prevRosterIncludeDP > 0) {
			time_t rest = 0, r1end = 0, r2start = 0;
			if (preRoster->pairId == 0) {
				rest = preRoster->getEndTimeUtcAct() - preRoster->getRestStartUtcAct();
			}
			else {
				rest = preRoster->pairing->getLastDuty()->getActualRest() * 60;
			}
			r1end = preRoster->getRestStartUtcAct();
			r2start = nowRoster->getStartTimeUtcAct();

			// rest不够 可合并
			if (r2start - r1end < rest) {
				auto getBoundaryDutyIndex = [](SharedPtr<ROSTER>& roster, bool useLastDuty) {
					if (!roster || roster->getDutyNums() <= 0) {
						return 0;
					}
					return useLastDuty ? (int)roster->getDutyNums() - 1 : 0;
				};
				auto getBoundaryStartUtc = [&](SharedPtr<ROSTER>& roster, bool useLastDuty) -> time_t {
					if (!roster) {
						return 0;
					}
					if (roster->pairing) {
						const auto* duty = useLastDuty ? roster->pairing->getLastDuty() : roster->pairing->getFirstDuty();
						return duty ? duty->getStartTimeUtcAct() : roster->getStartTimeUtcAct();
					}
					return roster->getStartTimeUtcAct();
				};
				auto getBoundaryEndUtc = [&](SharedPtr<ROSTER>& roster, bool useLastDuty) -> time_t {
					if (!roster) {
						return 0;
					}
					if (roster->pairing) {
						const auto* duty = useLastDuty ? roster->pairing->getLastDuty() : roster->pairing->getFirstDuty();
						return duty ? duty->getEndTimeUtcAct() : roster->getRestStartUtcAct();
					}
					return roster->getRestStartUtcAct();
				};
				auto getBoundaryDpSecs = [&](SharedPtr<ROSTER>& roster, bool useLastDuty) -> long {
					if (!roster) {
						return 0;
					}
					if (roster->pairing) {
						const auto* duty = useLastDuty ? roster->pairing->getLastDuty() : roster->pairing->getFirstDuty();
						return duty ? duty->getActualDP() * 60L : 0L;
					}
					const int dutyIndex = getBoundaryDutyIndex(roster, useLastDuty);
					return static_cast<long>((roster->getRestStartUtcAct() - roster->getStartTimeUtcAct()) * getDutyAssignmentDpPct(roster, dutyIndex));
				};
				auto canMergeDpPair = [&](int leftIdx, int rightIdx) {
					if (leftIdx < 0 || rightIdx >= (int)rosters.size() || leftIdx >= rightIdx) {
						return false;
					}
					auto& leftRoster = rosters[leftIdx];
					auto& rightRoster = rosters[rightIdx];
					if (!leftRoster || !rightRoster) {
						return false;
					}
					double leftRosterIncludeDP = getDutyAssignmentDpPct(leftRoster, (int)leftRoster->getDutyNums() - 1);
					if (leftRosterIncludeDP <= 0) {
						return false;
					}
					rule8107 pairMergeRule = matchRoster8107RuleParam(leftRoster, rightRoster, "DP", _dbData.get());
					if (pairMergeRule.mergeDpLogic.empty() || !pairMergeRule.isMergeDp) {
						return false;
					}
					time_t pairRest = 0;
					if (leftRoster->pairId == 0) {
						pairRest = leftRoster->getEndTimeUtcAct() - leftRoster->getRestStartUtcAct();
					}
					else {
						pairRest = leftRoster->pairing->getLastDuty()->getActualRest() * 60;
					}
					return rightRoster->getStartTimeUtcAct() - leftRoster->getRestStartUtcAct() < pairRest;
				};
				auto setGroupMergeDp = [&](int startIdx, int endIdx, int mergeDpMinutes) {
					for (int idx = startIdx; idx <= endIdx; ++idx) {
						auto& roster = rosters[idx];
						if (!roster) {
							continue;
						}
						roster->isMergeDpWithBefore = idx > startIdx;
						roster->isMergeDpWithNext = idx < endIdx;

						const int lastDutyIndex = getBoundaryDutyIndex(roster, true);
						const int firstDutyIndex = getBoundaryDutyIndex(roster, false);
						if (idx == startIdx || idx < endIdx) {
							roster->dutyValues.setMergeDp(lastDutyIndex, mergeDpMinutes);
						}
						if (idx == endIdx || idx > startIdx) {
							roster->dutyValues.setMergeDp(firstDutyIndex, mergeDpMinutes);
						}
					}
				};

				preRoster->isMergeDpWithNext = true;
				preRoster->mergeDpNextRosterId = nowRoster->rosterId;
				nowRoster->isMergeDpWithBefore = true;
				nowRoster->mergeDpBeforeRosterId = preRoster->rosterId;
				

				int groupStart = i - 1;
				while (groupStart > 0 && canMergeDpPair(groupStart - 1, groupStart)) {
					--groupStart;
				}
				int groupEnd = i;
				while (groupEnd + 1 < (int)rosters.size() && canMergeDpPair(groupEnd, groupEnd + 1)) {
					++groupEnd;
				}

				long mergeDpSecs = 0;
				string mergeDpLogic = mergeRule.mergeDpLogic;
				if (mergeDpLogic == "DUTYSTART" || mergeDpLogic == "DUTRYSTART") {
					time_t dpStart = getBoundaryStartUtc(rosters[groupStart], true);
					time_t dpEnd = getBoundaryEndUtc(rosters[groupEnd], false);
					mergeDpSecs = static_cast<long>(rosters[groupEnd]->getStartTimeUtcAct() - dpStart) + getBoundaryDpSecs(rosters[groupEnd], false);

					SharedPtr<mandayTimes> tempDp(new mandayTimes());
					tempDp->types = CALCULATION_TYPES::DP;
					tempDp->start = dpStart;
					tempDp->end = dpEnd;
					tempDp->percentage = 1.0;
					result.push_back(tempDp);
				}
				else if (mergeDpLogic == "DUTYBLOCK") {
					for (int idx = groupStart; idx <= groupEnd; ++idx) {
						mergeDpSecs += getBoundaryDpSecs(rosters[idx], idx != groupEnd);
					}
				}

				if (mergeDpSecs > 0) {
					setGroupMergeDp(groupStart, groupEnd, (int)(mergeDpSecs / 60));
				}
			}
		}
	}
}

long BasicCalculation::getDutyFdp(SharedPtr<ROSTER> & roster , int j) {

	if (roster->pairId != 0 && roster->pairing) {
		
		Duty* duty = roster->pairing->getDuty(j);
		if (!duty) {
			return 0;
		}

		// check is duty fdp calculated
		if (duty->isPlanFDPCalculated)
			return duty->getPlanFDP() * 60;

		long fdp = 0;
		const vector<Segment*>& Segments = duty->getSegments();
		bool isFerry = true;
		for (std::size_t i = 0; i < Segments.size(); i++) {
			map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = this->_dbData->assignmentNameMap.find(Segments[i]->getAssignment());
			if (segAssignment != this->_dbData->assignmentNameMap.end() && segAssignment->second && segAssignment->second->FDP_PCT > 0) {
				isFerry = false;
				break;
			}
		}
		if (!isFerry) {
			auto fdp = getCrewManDayAndFlightDutyPeriod(roster, j);
			duty->setPlanFDP(fdp / 60);
			duty->isPlanFDPCalculated = true;
			return fdp;
		}
		else {
			auto fdp = getCrewManDayAndFerryDutyPeriod(roster, j);
			duty->setPlanFDP(fdp / 60);
			duty->isPlanFDPCalculated = true;
			return fdp;
		}
	}
	else {
		return static_cast<long>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());
	}
}

long BasicCalculation::getDutyBlh(SharedPtr<ROSTER> & roster, int j) {

	if (roster->pairId != 0 && roster->pairing) {

		Duty* duty = roster->pairing->getDuty(j);
		if (!duty) {
			return 0;
		}
		return duty->getBLKInMins() * 60;
	}
	else {
		return 0;
	}
}

double BasicCalculation::getDutyAssignmentDpPct(SharedPtr<ROSTER>& roster, int j) {
	string assignment = roster->qualifier;
	if (roster->pairId != 0 && roster->pairing) {

		Duty* duty = roster->pairing->getDuty(j);
		if (!duty) {
			return 0.0;
		}
		assignment = duty->getAssignment();
	}
	auto assignmentIter = this->_dbData->assignmentNameMap.find(assignment);
	if (assignmentIter != this->_dbData->assignmentNameMap.end()) {
		return assignmentIter->second->DP_PCT;
	}
	return 0.0;
}

long BasicCalculation::getCrewManDayAndFlightDutyPeriod(const SharedPtr<ROSTER> & roster, const int j) {
	vector<SharedPtr<mandayTimes>>  result;
	return getCrewManDayAndFlightDutyPeriod(roster, j, result);
}

long BasicCalculation::getCrewManDayAndFlightDutyPeriod(const SharedPtr<ROSTER> & roster, const int j,vector<SharedPtr<mandayTimes>>& result) {
	// 2022.12.10 DP/GQ
	// 此函数计算FDP的逻辑和 CustomBiz.cpp中函数long calculateDutyFdp(...)计算FDP重复
	// BasicCalculation用于合并执勤期duty FDP计算，CustomBiz用于通用duty FDP计算
	// 两边逻辑有差异，对于长中转 BasicCalculation检查bIncludeCO， CustomBiz中检查bIncludeLongTransitCO，
	// 对于Tracking， BasicCalculation有确实duty node补actual brief/debrief time等逻辑， CustomBiz中没有
	// 目前两边的代码逻辑都保留，后续需要仔细梳理manday 和 fdp计算逻辑，将代码合并
	CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
	Duty* duty = roster->pairing->getDuty(j);
	vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes = duty->pairingDutyNodes;
	vector<Segment*> Segments = duty->getSegments();
	long fdp = 0;
	if (this->_dbData->getRuleFunctions(RULES::CALCULATE_COURSE_FDP_FOR_TG).size() > 0) {
		fdp = _ruleEngine->CalculateCourseDutyFDPForTG(duty, roster);

	} 

	if (fdp > 0) {
		SharedPtr<mandayTimes> tempFdp(new mandayTimes());
		tempFdp->types = CALCULATION_TYPES::FDP;
		tempFdp->start = duty->getStartTimeUtcAct();
		tempFdp->end = duty->getStartTimeUtcAct() + fdp * 60;
		tempFdp->percentage = 1.0;
		tempFdp->credit_percentage = 1.0;
		result.push_back(tempFdp);

		//FDP/ACT_FDP
		roster->dutyValues.setActFdp(j, fdp);//单位：分钟
	}
	else {
		bool nowSegIsHasNode = false;
		for (std::size_t i = 0; i < pairingDutyNodes.size(); i++) {
			//int locToUtc = static_cast<int>(Segments[0]->getStartTimeUtcAct() - Segments[0]->getStartTimeLocAct());
			int locToUtc = SegmentUtils::GetFastTimeZoneOffsetByDep(*Segments[0], this->_dbData);
			if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeCI) {
				nowSegIsHasNode = true;
				if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
			}
			else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeCO) {
				nowSegIsHasNode = true;
				if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
			}
			else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
				nowSegIsHasNode = true;
				if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
			}
			else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
				nowSegIsHasNode = true;
				if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
			}
			else {
				continue;
			}
			fdp += static_cast<long>(pairingDutyNodes[i]->getEndLoc() - pairingDutyNodes[i]->getStartLoc());
			SharedPtr<mandayTimes> tempFdp(new mandayTimes());
			tempFdp->types = CALCULATION_TYPES::FDP;
			tempFdp->start = pairingDutyNodes[i]->getStartLoc() + locToUtc;
			tempFdp->end = pairingDutyNodes[i]->getEndLoc() + locToUtc;
			tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
			tempFdp->credit_percentage = 1.0;
			result.push_back(tempFdp);
		}

		for (int i = 0; i < (int)Segments.size(); i++) {

			//int locToUtc = static_cast<int>(Segments[i]->getStartTimeUtcAct() - Segments[i]->getStartTimeLocAct());
			int locToUtc = SegmentUtils::GetFastTimeZoneOffsetByDep(*Segments[i], this->_dbData);
			for (std::size_t j = 0; j < pairingDutyNodes.size(); j++) {
				if (Segments[i]->getSegmentId() == pairingDutyNodes[j]->getToSegmentId()) {
					nowSegIsHasNode = true;
					if (pairingDutyNodes[j]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeCI) {
						nowSegIsHasNode = true;
						if (pairingDutyNodes[j]->getEndLoc() == pairingDutyNodes[j]->getStartLoc())continue;
					}
					else if (pairingDutyNodes[j]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeCO) {
						nowSegIsHasNode = true;
						if (pairingDutyNodes[j]->getEndLoc() == pairingDutyNodes[j]->getStartLoc())continue;

					}
					else if (pairingDutyNodes[j]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
						nowSegIsHasNode = true;
						if (pairingDutyNodes[j]->getEndLoc() == pairingDutyNodes[j]->getStartLoc())continue;
					}
					else if (pairingDutyNodes[j]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
						nowSegIsHasNode = true;
						if (pairingDutyNodes[j]->getEndLoc() == pairingDutyNodes[j]->getStartLoc())continue;
					}

					if (pairingDutyNodes[j]->getEndLoc() <= 0 || pairingDutyNodes[j]->getStartLoc() <= 0) {
						continue;
					}
					fdp += static_cast<long>(pairingDutyNodes[j]->getEndLoc() - pairingDutyNodes[j]->getStartLoc());

					//locToUtc = static_cast<int>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getEndTimeLocAct());//mantis#8835, manday 长中转FDP locToUtc时区修正计算提前，避免start/end使用不同时区
					locToUtc = SegmentUtils::GetFastTimeZoneOffsetByDep(*Segments[i], this->_dbData);
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = pairingDutyNodes[j]->getStartLoc() + locToUtc;
					tempFdp->end = pairingDutyNodes[j]->getEndLoc() + locToUtc;
					tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp->credit_percentage = 1.0;
					result.push_back(tempFdp);
				}
			}
			bool preSeg = false, nowSeg = false;
			if (i > 0) {
				map<string, SharedPtr<ASSIGNMENT>>::iterator sAssignment = this->_dbData->assignmentNameMap.find(Segments[i]->getAssignment());
				if ((sAssignment != this->_dbData->assignmentNameMap.end() && sAssignment->second &&sAssignment->second->FDP_PCT > 0)
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))) {
					nowSeg = true;
				}
				sAssignment = this->_dbData->assignmentNameMap.find(Segments[i - 1]->getAssignment());
				if ((sAssignment != this->_dbData->assignmentNameMap.end() && sAssignment->second && sAssignment->second->FDP_PCT > 0)
					|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount)
					//|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD&& Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY)
					//|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround)
					//|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay)
					//|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB)
					//|| (this->_dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					) {
					preSeg = true;
				}
			}
			//SEG之间的计算
			if (!nowSegIsHasNode && i != 0 && nowSeg && preSeg) {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(Segments[i - 1], Segments[i]);
				if (longTransit) {
					//20201106 mantis#8973: 大过站FDP计算逻辑更正
					int blank = static_cast<int>(Segments[i]->getStartTimeUtcSch() - Segments[i - 1]->getEndTimeUtcAct());
					if (blank > (longTransit->pseudoCI + longTransit->pseudoCO + longTransit->pseudoDropoff + longTransit->pseudoPickup) * 60) {
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCO) {
							fdp += longTransit->pseudoCO * 60;
							SharedPtr<mandayTimes> tempFdp(new mandayTimes());
							tempFdp->types = CALCULATION_TYPES::FDP;
							tempFdp->start = Segments[i - 1]->getEndTimeUtc("ACT");
							tempFdp->end = Segments[i - 1]->getEndTimeUtc("ACT") + longTransit->pseudoCO * 60;
							tempFdp->percentage = 1.0;
							tempFdp->credit_percentage = 1.0;
							result.push_back(tempFdp);
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitDropoff) {
							fdp += longTransit->pseudoDropoff * 60;
							SharedPtr<mandayTimes> tempFdp(new mandayTimes());
							tempFdp->types = CALCULATION_TYPES::FDP;
							tempFdp->start = Segments[i - 1]->getEndTimeUtc("ACT") + longTransit->pseudoCO * 60;
							tempFdp->end = Segments[i - 1]->getEndTimeUtc("ACT") + longTransit->pseudoCO * 60 + longTransit->pseudoDropoff * 60;
							tempFdp->percentage = 1.0;
							tempFdp->credit_percentage = 1.0;
							result.push_back(tempFdp);
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitPickup) {
							fdp += longTransit->pseudoPickup * 60;
							SharedPtr<mandayTimes> tempFdp(new mandayTimes());
							tempFdp->types = CALCULATION_TYPES::FDP;
							tempFdp->start = Segments[i]->getStartTimeUtc("SCH") - longTransit->pseudoCI * 60 - longTransit->pseudoPickup * 60;
							tempFdp->end = Segments[i]->getStartTimeUtc("SCH") - longTransit->pseudoCI * 60;
							tempFdp->percentage = 1.0;
							tempFdp->credit_percentage = 1.0;
							result.push_back(tempFdp);
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCI) {
							fdp += longTransit->pseudoCI * 60;
							SharedPtr<mandayTimes> tempFdp(new mandayTimes());
							tempFdp->types = CALCULATION_TYPES::FDP;
							tempFdp->start = Segments[i]->getStartTimeUtc("SCH") - longTransit->pseudoCI * 60;
							tempFdp->end = Segments[i]->getStartTimeUtc("SCH");
							tempFdp->percentage = 1.0;
							tempFdp->credit_percentage = 1.0;
							result.push_back(tempFdp);
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
							fdp += blank - longTransit->pseudoCI * 60 - longTransit->pseudoCO * 60 - longTransit->pseudoDropoff * 60 - longTransit->pseudoPickup * 60;
							SharedPtr<mandayTimes> tempFdp(new mandayTimes());
							tempFdp->types = CALCULATION_TYPES::FDP;
							tempFdp->start = Segments[i - 1]->getEndTimeUtc("ACT") + longTransit->pseudoCO * 60 + longTransit->pseudoDropoff * 60;
							tempFdp->end = Segments[i]->getStartTimeUtc("ACT") - longTransit->pseudoCI * 60 - longTransit->pseudoPickup * 60;
							tempFdp->percentage = 1.0;
							tempFdp->credit_percentage = 1.0;
							result.push_back(tempFdp);
						}
					}
					else {
						fdp += blank;
						SharedPtr<mandayTimes> tempFdp(new mandayTimes());
						tempFdp->types = CALCULATION_TYPES::FDP;
						tempFdp->start = Segments[i - 1]->getEndTimeUtcAct();
						tempFdp->end = Segments[i]->getStartTimeUtcSch();
						tempFdp->percentage = 1.0;
						tempFdp->credit_percentage = 1.0;
						result.push_back(tempFdp);
					}
					//20201103 mantis#8950 seg长中转需加上 ATD-STD
					fdp += static_cast<long>(Segments[i]->getStartTimeUtcAct() - Segments[i]->getStartTimeUtcSch());
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = Segments[i]->getStartTimeUtcSch();
					tempFdp->end = Segments[i]->getStartTimeUtcAct();
					tempFdp->percentage = 1.0;
					result.push_back(tempFdp);
				}
				else {
					//20200917 ain, mantis#8766, seg之间不是长中转则全部算入fdp
					fdp += static_cast<long>(Segments[i]->getStartTimeUtcAct() - Segments[i - 1]->getEndTimeUtcAct());
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = Segments[i - 1]->getEndTimeUtcAct();
					tempFdp->end = Segments[i]->getStartTimeUtcAct();
					tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp->credit_percentage = 1.0;
					result.push_back(tempFdp);
				}
				//if (RuleParams::GetInstancePtr()->getLongTransitBrief(Segments[i - 1], Segments[i]) * 60
				//	+ RuleParams::GetInstancePtr()->getLongTransitDebrief(Segments[i - 1], Segments[i]) * 60
				//	< Segments[i]->getStartTimeUtcSch() - Segments[i - 1]->getEndTimeUtcAct()) {
				//	fdp += RuleParams::GetInstancePtr()->getLongTransitBrief(Segments[i - 1], Segments[i]) * 60;
				//	SharedPtr<mandayTimes> tempFdp1(new mandayTimes());
				//	tempFdp1->types = CALCULATION_TYPES::FDP;
				//	tempFdp1->start = Segments[i]->getStartTimeUtc(FDP.str) - RuleParams::GetInstancePtr()->getLongTransitBrief(Segments[i - 1], Segments[i]) * 60;
				//	tempFdp1->end = Segments[i]->getStartTimeUtc(FDP.str);
				//	tempFdp1->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
				//	if (tempFdp1->start != tempFdp1->end)
				//		result.push_back(tempFdp1);
				//	fdp += RuleParams::GetInstancePtr()->getLongTransitDebrief(Segments[i - 1], Segments[i]) * 60;
				//	SharedPtr<mandayTimes> tempFdp2(new mandayTimes());
				//	tempFdp2->types = CALCULATION_TYPES::FDP;
				//	tempFdp2->start = Segments[i - 1]->getEndTimeUtc(FDP.end);
				//	tempFdp2->end = Segments[i - 1]->getEndTimeUtc(FDP.end) + RuleParams::GetInstancePtr()->getLongTransitDebrief(Segments[i - 1], Segments[i]) * 60;
				//	tempFdp2->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
				//	if (tempFdp2->start != tempFdp2->end)
				//		result.push_back(tempFdp2);
				//}
				//else if (Segments[i - 1]->isLongTransitWithNext()) {
				//	fdp += Segments[i]->getStartTimeUtcSch() - Segments[i - 1]->getEndTimeUtcAct();
				//	SharedPtr<mandayTimes> tempFdp(new mandayTimes());
				//	tempFdp->types = CALCULATION_TYPES::FDP;
				//	tempFdp->start = Segments[i - 1]->getEndTimeUtcAct();
				//	tempFdp->end = Segments[i]->getStartTimeUtcSch();
				//	tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
				//	result.push_back(tempFdp);
				//}

				//if (!Segments[i - 1]->isLongTransitWithNext()) {
				//	fdp += Segments[i]->getStartTimeUtcAct() - Segments[i - 1]->getEndTimeUtcAct();
				//	SharedPtr<mandayTimes> tempFdp(new mandayTimes());
				//	tempFdp->types = CALCULATION_TYPES::FDP;
				//	tempFdp->start = Segments[i - 1]->getEndTimeUtcAct();
				//	tempFdp->end = Segments[i]->getStartTimeUtcAct();
				//	tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
				//	result.push_back(tempFdp);
				//}
				//else {
				//	fdp += Segments[i]->getStartTimeUtcAct() - Segments[i]->getStartTimeUtcSch();
				//	SharedPtr<mandayTimes> tempFdp(new mandayTimes());
				//	tempFdp->types = CALCULATION_TYPES::FDP;
				//	tempFdp->start = Segments[i]->getStartTimeUtcSch();
				//	tempFdp->end = Segments[i]->getStartTimeUtcAct();
				//	tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
				//	result.push_back(tempFdp);
				//}
			}
			else if (!nowSegIsHasNode && i == 0) {
				if (duty->getActualBriefMin() != 0 && RuleParams::GetInstancePtr()->bIncludeCI) {
					fdp += duty->getActualBriefMin() * 60;
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = Segments[i]->getStartTimeUtc(FDP.str) - duty->getActualBriefMin();
					tempFdp->end = Segments[i]->getStartTimeUtc(FDP.str);
					tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp->credit_percentage = 1.0;
					result.push_back(tempFdp);
				}
				if (duty->getActualDebriefMin() != 0 && RuleParams::GetInstancePtr()->bIncludeCO) {
					fdp += duty->getActualDebriefMin() * 60;
					SharedPtr<mandayTimes> tempFdp1(new mandayTimes());
					tempFdp1->types = CALCULATION_TYPES::FDP;
					tempFdp1->start = Segments[Segments.size() - 1]->getEndTimeUtc(FDP.end);
					tempFdp1->end = Segments[Segments.size() - 1]->getEndTimeUtc(FDP.end) + duty->getActualDebriefMin();
					tempFdp1->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp1->credit_percentage = 1.0;
					result.push_back(tempFdp1);
				}
				if (duty->getActualPickupMin() != 0 && RuleParams::GetInstancePtr()->bPickupCount) {
					fdp += duty->getActualPickupMin() * 60;
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = Segments[i]->getStartTimeUtc(FDP.str) - duty->getActualBriefMin() - duty->getActualPickupMin();
					tempFdp->end = Segments[i]->getStartTimeUtc(FDP.str) - duty->getActualBriefMin();
					tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp->credit_percentage = 1.0;
					result.push_back(tempFdp);
				}
				if (duty->getActualDropoffMin() != 0 && RuleParams::GetInstancePtr()->bDropoffCount) {
					fdp += duty->getActualDropoffMin() * 60;
					SharedPtr<mandayTimes> tempFdp1(new mandayTimes());
					tempFdp1->types = CALCULATION_TYPES::FDP;
					tempFdp1->start = Segments[Segments.size() - 1]->getEndTimeUtc(FDP.end) + duty->getActualDebriefMin();
					tempFdp1->end = Segments[Segments.size() - 1]->getEndTimeUtc(FDP.end) + duty->getActualDebriefMin() + duty->getActualDropoffMin();
					tempFdp1->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp1->credit_percentage = 1.0;
					result.push_back(tempFdp1);
				}
			}
			nowSegIsHasNode = false;
			map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = this->_dbData->assignmentNameMap.find(Segments[i]->getAssignment());
			if (segAssignment == this->_dbData->assignmentNameMap.end() || segAssignment->second->FDP_PCT == 0) {
				if ((this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, this->_dbData.get()))
					|| (this->_dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, this->_dbData.get()))
					) {
					fdp += static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
					SharedPtr<mandayTimes> tempFdp(new mandayTimes());
					tempFdp->types = CALCULATION_TYPES::FDP;
					tempFdp->start = Segments[i]->getStartTimeUtcAct();
					tempFdp->end = Segments[i]->getEndTimeUtcAct();
					tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
					tempFdp->credit_percentage = 1.0;
					result.push_back(tempFdp);
				}
			}
			else {
				double fdpPct = segAssignment->second->FDP_PCT;
				//20190924 ain, mantis#6777, 引入dutyNode后fdp计算不再需要CalculationManday[FDP], 直接用seg.act计算
				//fdp += Segments[i]->getEndTimeUtc(FDP.end) - Segments[i]->getStartTimeUtc(FDP.str);
				fdp += static_cast<long>((Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct()) * fdpPct);
				SharedPtr<mandayTimes> tempFdp(new mandayTimes());
				tempFdp->types = CALCULATION_TYPES::FDP;
				tempFdp->start = Segments[i]->getStartTimeUtcAct();
				tempFdp->end = Segments[i]->getEndTimeUtcAct();
				tempFdp->percentage = fdpPct; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
				tempFdp->credit_percentage = segAssignment->second->CREDIT_PCT;
				result.push_back(tempFdp);
			}
		}

		// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
		if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {
			const auto& lastFdpSegment = duty->getLastFdpSegment();
			if (lastFdpSegment) {
				size_t segmentIdAfterFDP = std::numeric_limits<size_t>::max();
				for (size_t i = 0; i < duty->getSegmentsRead().size(); ++i) {
					const auto& segment = duty->getSegment(i);
					if (segment == lastFdpSegment && i != duty->getSegmentsRead().size() - 1) {
						segmentIdAfterFDP = i + 1;
						break;
					}
				}
				if (segmentIdAfterFDP < std::numeric_limits<size_t>::max()) {
					const auto transitTime = duty->getSegment(segmentIdAfterFDP)->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT");
					fdp += std::min((long)transitTime, static_cast<long>(RuleParams::GetInstancePtr()->postActivityThreshold * 60));
				}
			}
		}
		//int locToUtc = static_cast<int>(Segments[0]->getStartTimeUtcAct() - Segments[0]->getStartTimeLocAct());
		int locToUtc = SegmentUtils::GetFastTimeZoneOffsetByDep(*Segments[0], this->_dbData);

		//按照2107法规固定增加FIXED EXTENSTION设置值
		if (RuleParams::GetInstancePtr()->iFixedValueToFDP > 0) {
			fdp += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP);

			time_t start = duty->getLastFdpSegment()->getEndTimeUtcAct();
			if (RuleParams::GetInstancePtr()->bDropoffCount) {
				start = duty->getLastDropoff()->getEndLoc() + locToUtc;
			}
			else if (RuleParams::GetInstancePtr()->bIncludeCO) {
				start = duty->getLastDebrief()->getEndLoc() + locToUtc;
			}
			time_t end = start + 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP);

			if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {
				end += RuleParams::GetInstancePtr()->postActivityThreshold * 60;
				const auto& lastFdpSegment = duty->getLastFdpSegment();
				if (lastFdpSegment) {
					const auto& index = lastFdpSegment->getSegSeq();
					if (index < (int)duty->getNumSegments()) {
						int transitTime = static_cast<int>(duty->getSegments()[index]->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT"));
						if (transitTime < RuleParams::GetInstancePtr()->postActivityThreshold * 60) {
							end -= RuleParams::GetInstancePtr()->postActivityThreshold * 60 - transitTime;
						}
					}
				}

			}

			SharedPtr<mandayTimes> tempFdp(new mandayTimes());
			tempFdp->types = CALCULATION_TYPES::FDP;
			tempFdp->start = start;
			tempFdp->end = end;
			tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
			result.push_back(tempFdp);
		}


		if (RuleParams::GetInstancePtr()->beforeFixValueToFDP > 0) {
			fdp += 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);

			time_t end = duty->getFirstFdpSegment()->getStartTimeUtcAct();
			if (RuleParams::GetInstancePtr()->bPickupCount) {
				end = duty->getFirstPickup()->getStartLoc() + locToUtc;
			}
			else if (RuleParams::GetInstancePtr()->bIncludeCI) {
				end = duty->getFirstBreif()->getStartLoc() + locToUtc;
			}

			SharedPtr<mandayTimes> tempFdp(new mandayTimes());
			tempFdp->types = CALCULATION_TYPES::FDP;
			tempFdp->start = end - 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);
			tempFdp->end = end;
			tempFdp->percentage = 1.0; //20190517 ain, mantis#5584, 缺失pct赋值, 补齐逻辑
			result.push_back(tempFdp);
		}

		//FDP/ACT_FDP
		roster->dutyValues.setActFdp(j, fdp / 60);
	}
	return fdp;
}

long BasicCalculation::getCrewManDayAndFerryDutyPeriod(const SharedPtr<ROSTER> & roster, const int j) {
	vector<SharedPtr<mandayTimes>>  result;
	return getCrewManDayAndFerryDutyPeriod(roster, j, result);
}

long BasicCalculation::getCrewManDayAndFerryDutyPeriod(const SharedPtr<ROSTER> & roster,const int j, const vector<SharedPtr<mandayTimes>>& result) {
	
	Duty* duty = roster->pairing->getDuty(j);
	vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes = duty->pairingDutyNodes;
	const vector<Segment*>& Segments = duty->getSegments();
	long fdp = 0;

	bool nowSegIsHasNode = false;
	for (std::size_t i = 0; i < pairingDutyNodes.size(); i++) {
		//int locToUtc = static_cast<int>(Segments[0]->getStartTimeUtcAct() - Segments[0]->getStartTimeLocAct());
		//int locToUtc = SegmentUtils::GetFastTimeZoneOffsetByDep(*Segments[0], this->_dbData);
		if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeCI) {
			nowSegIsHasNode = true;
			if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeCO) {
			nowSegIsHasNode = true;
			if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
			nowSegIsHasNode = true;
			if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
			nowSegIsHasNode = true;
			if (pairingDutyNodes[i]->getEndLoc() == pairingDutyNodes[i]->getStartLoc())continue;
		}
		else {
			continue;
		}
		fdp += static_cast<long>(pairingDutyNodes[i]->getEndLoc() - pairingDutyNodes[i]->getStartLoc());
	}

	for (const auto& segment : Segments) {
		const auto& assignment = this->_dbData->assignmentNameMap.find(segment->getAssignment());
		if (assignment != this->_dbData->assignmentNameMap.end()) {
			const auto& fdp_pct = assignment->second->FDP_PCT;
			fdp += static_cast<long>((segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct()) * fdp_pct);
		}
		
	}
	if (this->_dbData->getRuleFunctions(RULES::CALCULATE_COURSE_FDP_FOR_TG).size() > 0) {
		fdp = _ruleEngine->CalculateCourseDutyFDPForTG(duty, roster) * 60;
	}
	//fdp += static_cast<long>(Segments[0]->getEndTimeUtcAct() - Segments[0]->getStartTimeUtcAct());
	return fdp;
}

void splitMandayTimesPH(vector<SharedPtr<mandayTimes>>& list, int offsetMinutes) {
	for (int i = (int)list.size() - 1; i >= 0; i--) {
		auto& item = list[i];
		if (item->types == CALCULATION_TYPES::PERDIEM) {
			int startLocalDayNum = static_cast<int>((item->start + offsetMinutes * 60) / (24 * 3600));
			int endLocalDayNum = static_cast<int>((item->end + offsetMinutes * 60) / (24 * 3600));
			if (startLocalDayNum != endLocalDayNum) {
				SharedPtr<mandayTimes> tmp(new mandayTimes);
				tmp->start = endLocalDayNum * (24 * 3600) - offsetMinutes * 60;
				tmp->end = item->end;
				tmp->adjustment = item->adjustment;
				tmp->percentage = item->percentage;
				tmp->credit_percentage = item->credit_percentage;
				tmp->divide = item->divide;
				tmp->setValue = 0;
				list.push_back(tmp);
				//拆分后按 tmp.start --> item.end, 且PH只有最后一天需要adj
				item->adjustment = 0;
				item->end = tmp->start;
			}
		}
	}
}

map<time_t, SharedPtr<CREW_MANDAY_BASIC>> BasicCalculation::calculateManDays(vector<SharedPtr<ROSTER>>& rosters, bool setCalculated)
{
	if (rosters.empty()) {
		return map<time_t, SharedPtr<CREW_MANDAY_BASIC>>();
	}
	time_t nowInUtc = time(0);
	//if (_crew->idCrew == "100223")
	//	printf("");
	vector<SharedPtr<mandayTimes>> times = getCrewManDayTimes(rosters, setCalculated);
	if (_dbData->scenario.airline != "BR"){
#ifdef WIN32
		vector<SharedPtr<mandayTimes>>& fdpTimes = getCrewManDayFdpTimes(rosters, setCalculated);
#else
		const vector<SharedPtr<mandayTimes>>& fdpTimes = getCrewManDayFdpTimes(rosters, setCalculated);
#endif
		times.insert(times.end(), std::make_move_iterator(fdpTimes.begin()), std::make_move_iterator(fdpTimes.end()));
	}

	if (_dbData->scenario.airline != "BR") {
#ifdef WIN32
		vector<SharedPtr<mandayTimes>>& fdpTimes = getCrewManDayDpTimes(rosters, setCalculated);
#else
		const vector<SharedPtr<mandayTimes>>& fdpTimes = getCrewManDayDpTimes(rosters, setCalculated);
#endif
		times.insert(times.end(), std::make_move_iterator(fdpTimes.begin()), std::make_move_iterator(fdpTimes.end()));
	}

	// 处理 DP 类型的时间段重叠，重叠部分按 percentage 高的来
	{
		// 筛选出所有 DP 类型的 mandayTime 索引
		vector<size_t> dpIndices;
		for (size_t i = 0; i < times.size(); i++) {
			if (times[i]->types == CALCULATION_TYPES::DP) {
				dpIndices.push_back(i);
			}
		}

		if (dpIndices.size() > 1) {
			// 按 percentage 从高到低排序
			std::sort(dpIndices.begin(), dpIndices.end(), [&times](size_t a, size_t b) {
				return times[a]->percentage > times[b]->percentage;
			});

			// 记录已经被高 percentage DP 占据的时间区间
			vector<pair<time_t, time_t>> occupied;

			// 新添加的 DP（由分割产生的新时间段）
			vector<SharedPtr<mandayTimes>> newDpTimes;

			// 按 percentage 从高到低处理
			for (size_t idx : dpIndices) {
				SharedPtr<mandayTimes> dp = times[idx];
				vector<pair<time_t, time_t>> effective = { {dp->start, dp->end} };

				// 从 effective 中移除与所有 occupied 重叠的部分
				for (const auto& occ : occupied) {
					vector<pair<time_t, time_t>> newEffective;
					for (const auto& eff : effective) {
						time_t overlapStart = std::max(eff.first, occ.first);
						time_t overlapEnd = std::min(eff.second, occ.second);

						if (overlapStart < overlapEnd) {
							// 有重叠，保留不重叠的部分
							if (eff.first < overlapStart) {
								newEffective.push_back({eff.first, overlapStart});
							}
							if (overlapEnd < eff.second) {
								newEffective.push_back({overlapEnd, eff.second});
							}
						} else {
							// 无重叠，保留原区间
							newEffective.push_back(eff);
						}
					}
					effective = newEffective;
				}

				// 更新原 DP 的时间
				if (effective.empty()) {
					times[idx]->start = 0;
					times[idx]->end = 0;
				} else {
					times[idx]->start = effective[0].first;
					times[idx]->end = effective[0].second;
					occupied.push_back(effective[0]);

					// 分割部分添加到新列表
					for (size_t i = 1; i < effective.size(); i++) {
						SharedPtr<mandayTimes> newMt = std::make_shared<mandayTimes>(*dp);
						newMt->start = effective[i].first;
						newMt->end = effective[i].second;
						newDpTimes.push_back(newMt);
						occupied.push_back(effective[i]);
					}
				}
			}

			// 将新添加的 DP 加入 times
			times.insert(times.end(), newDpTimes.begin(), newDpTimes.end());

			// 移除无效的 DP（start=0）
			times.erase(std::remove_if(times.begin(), times.end(), [](const SharedPtr<mandayTimes>& mt) {
				return mt->types == CALCULATION_TYPES::DP && mt->start == 0;
			}), times.end());
		}
	}

	///TEST
	//if (rosters.size() > 0 && ("RY1308005" == rosters[0]->idcrew)) {
	//	cout << "**DBG ph.size=" << times.size() << endl;
	//	for (auto& mt : times) {
	//		if (mt->types != CALCULATION_TYPES::BH
	//			&& mt->types != CALCULATION_TYPES::DP 
	//			&& mt->types != CALCULATION_TYPES::FDP
	//			) {
	//			continue;
	//		}
	//		if (mt->start >= utcStrToUtc("2021-6-11") && mt->start <= utcStrToUtc("2021-6-21"))
	//			cout << "**DBG mandayTime " << mt->types << rosters[0]->idcrew
	//			<< " " << utcToUtcString(mt->start)
	//			<< " " << utcToUtcString(mt->end)
	//			<< " v=" << (mt->end - mt->start) << " (" << (mt->end - mt->start) / 60 << ")"
	//			<< " type=" << mt->types
	//			<< " adj=" << mt->adjustment
	//			<< " pct=" << mt->percentage
	//			<< endl;
	//	}
	//	for (auto& r : rosters) {
	//		if (r->getStartTimeLocSch() >= utcStrToUtc("2021-6-11") && r->getStartTimeLocSch() <= utcStrToUtc("2021-6-21")) {
	//			cout << "**DBG roster "
	//				<< r->idcrew << " "
	//				<< r->duty << " " << r->label << " " 
	//				<< utcToUtcString(r->getStartTimeLocAct()) << " "
	//				<< utcToUtcString(r->restStrLoc) << " "
	//				<< endl;
	//		}
	//	}
	//}
	
	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	string timezone = this->_dbData->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"];
	//string divide = this->_dbData->systemParamMap["DIVIDE_CREW_MANDAY"];

	int calcOffsetMinutes = 0;
	string zoneId = "";
	if (timezone == "CREW_BASE" || timezone == "UTC2") {
		zoneId = this->_dbData->airportZoneIdMap[base];
		calcOffsetMinutes = crewBaseOffsetMinutes;
	}
	else if (timezone != "UTC") {
		zoneId = this->_dbData->airportZoneIdMap[timezone];
		calcOffsetMinutes = this->_dbData->getAirportOffsetMinutes(timezone);
	}
	// 默认base时区
	else {
		zoneId = this->_dbData->airportZoneIdMap[base];
	}

	
	map<time_t, SharedPtr<CREW_MANDAY_BASIC>> mResults;

	time_t localStartDayInUtc = 0, localEndDayInUtc = 0;
	time_t currentDayStartInUtc = 0;
	int iDaysBetween = 0;//间隔日历天数
	double setValues = 0, duration = 0;
	map<time_t, SharedPtr<CREW_MANDAY_BASIC>>::iterator singleResult;
	for (auto& mandayTime : times)
	{
		if (mandayTime->start <= 0) {
			Logger::getRuleLogger()->error("[DataCheck] invalid data, error mandayTime types={}, start={}, end={}.",
				mandayTime->types, mandayTime->start, mandayTime->end);
			continue;
		}
		
		calcOffsetMinutes = TimezoneUtils::GetTimezoneOffset(mandayTime->start, zoneId);
		//localStartDay = this->_crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(mandayTime->start);
		//localEndDay = this->_crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(mandayTime->end);
		//if (_crew->idCrew == "D94021" // && mandayTime->start >= 1525104000 && mandayTime->end <= 1525363200
		//	&& mandayTime->types >= 100)
		//	printf("");

		//manday里统计次数的统计项一律按照CREW BASE计算次数(0/1)，其余按照CREW_MANDAY_STORE_TIMEZONE参数设置的时区统计计算值
		int mandayTimezoneMinutes = 0;
		//if (mandayTime->types >= CALCULATION_TYPES::DO)
		/*if (isCrewBaseTimezone(mandayTime->types))
		{
			localStartDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(mandayTime->start, crewBaseOffsetMinutes);
			localEndDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(mandayTime->end, crewBaseOffsetMinutes);
			mandayTimezoneMinutes = crewBaseOffsetMinutes;
		}
		else
		{*/
			localStartDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(mandayTime->start, calcOffsetMinutes);
			localEndDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(mandayTime->end, calcOffsetMinutes);
			mandayTimezoneMinutes = calcOffsetMinutes;
		//}
		time_t nowLocalDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowInUtc, mandayTimezoneMinutes);//系统时间转换成本地时间所在天（UTC时区)
		// 增加保护，只计算一年内的manday
		//iDaysBetween = min((int)((localEndDay - localStartDay) / (24 * 3600) + 1), 365);
		//计算采用左闭右开[1730592000,1730678400) 、[2024/11/3 0:00:00, 2024/11/4 0:00:00)  2024/11/4为0分钟，因此不计入。iDaysBetween=1天
		time_t localStartTime = mandayTime->start + mandayTimezoneMinutes * 60;//本地时区开始时间
		time_t localEndTime = mandayTime->end + mandayTimezoneMinutes * 60;//本地时区结束时间
 		iDaysBetween = min((int)((localEndTime - 1) / (24 * 60 * 60) - localStartTime / (24 * 60 * 60) + 1), 365);
		int iPhTaken = 0;
		for (int i = 0; i < iDaysBetween; ++i)
		{
			currentDayStartInUtc = localStartDayInUtc + i * 24 * 3600;
			//OP1874切分Crew Manday逻辑的加强

			if ((mandayTime->types == CALCULATION_TYPES::LEA ||
				mandayTime->types == CALCULATION_TYPES::DO ||
				mandayTime->types == CALCULATION_TYPES::SBY ||
				mandayTime->types == CALCULATION_TYPES::GND ||
				mandayTime->types == CALCULATION_TYPES::CSB ||
				mandayTime->types == CALCULATION_TYPES::HSB ||
				mandayTime->types == CALCULATION_TYPES::ASB ||
				mandayTime->types == CALCULATION_TYPES::AL) && mandayTime->divide == "D")
			{
				currentDayStartInUtc = localStartDayInUtc;
			}

			time_t minEnd = min(currentDayStartInUtc + 24 * 3600, mandayTime->end);
			time_t maxStart = max(currentDayStartInUtc, mandayTime->start);
			if (minEnd > maxStart){
				//20190221 ain, mantis#4970, BH adj只对 BH/PH/WP生效, BH/PH分支单独处理
				setValues = ((minEnd - maxStart + mandayTime->beforePct * 60) * mandayTime->percentage) / 60.0;
				duration = (minEnd - maxStart) / 60.0;
			}
			//20181102 ain, mantis#4373, 为实应ph adj逻辑，支持value=0 adj>0 的mandayTime
			else if (minEnd == maxStart && mandayTime->adjustment > 0) {
				setValues = 0;
				duration = 0;
			}
			else
				continue;

			int gnteeFlyingHours = getGuaranteeFlyingHour(idCrew, currentDayStartInUtc);
			//20190221 ain, mantis#4970, BH/WP adj修正只对末尾日期
			if (( mandayTime->types == CALCULATION_TYPES::BH 
				|| mandayTime->types == CALCULATION_TYPES::WP
				|| mandayTime->types == CALCULATION_TYPES::HIGH_PLATEAU)
				&& i == iDaysBetween - 1) {
				setValues += (mandayTime->adjustment / 60.0);
			}
			if (mandayTime->types == CALCULATION_TYPES::DP && i == iDaysBetween - 1) {
				setValues += mandayTime->dp_gap + mandayTime->adjust_for_pr / 60;
			}

			//0003805: PH ADJUST超過24小時的處理
			//if (setValues >= 1439)
			//	setValues = 1440;
			//20180922 ain, mantis#4131, 按manday.dateLoc汇总合并
			singleResult = mResults.find(currentDayStartInUtc + mandayTimezoneMinutes * 60);

			//if ((currentDayStart == 1520352000 || currentDayStart == 1520438400) && (this->_crew->idCrew == "354400") && mandayTime->types == CALCULATION_TYPES::DP)
			//	printf("");
			//if ((setValues == 1000 || setValues == 600 || setValues == 40) && mandayTime->types == CALCULATION_TYPES::DP && this->_crew->idCrew == "354400")
			//	printf("");

			if (singleResult == mResults.end())
			{
				SharedPtr<CREW_MANDAY_BASIC> temp = std::make_shared<CREW_MANDAY_BASIC>();

				temp->crewDateUtc = currentDayStartInUtc;
				temp->dateLoc = currentDayStartInUtc + mandayTimezoneMinutes * 60; //20180922 ain, mantis#4131, 创建manday时立即计算dateLoc
				temp->recalFleetLanding = (currentDayStartInUtc >= nowLocalDayInUtc);//今天和未来时间重新计算FleetLanding
				temp->idCrew = idCrew;

				if (mandayTime->types == CALCULATION_TYPES::BH) {
					temp->blh = setValues;
					temp->credit += (duration * mandayTime->credit_percentage);
				}
				else if (mandayTime->types == CALCULATION_TYPES::DP)
					temp->dp = setValues;
				else if (mandayTime->types == CALCULATION_TYPES::FDP) {
					temp->fdp = setValues;
				}
				else if (mandayTime->types == CALCULATION_TYPES::FT) {
					temp->ft = setValues;
					temp->addOperatingFleets(mandayTime->operating_fleets);

					//若mandayTime跨天，则第一天(i==0)为经过起飞机场，最后一天(i == iDaysBetween - 1)为经过落地机场
					if (i == 0) {
						temp->addOperatingAirports(mandayTime->operating_dep_airports);
						temp->addFleetTakeoff(mandayTime->fleetTakeoff);
						temp->addNightFleetTakeoff(mandayTime->nightFleetTakeoff);
					}
					if (i == iDaysBetween - 1) {
						temp->addOperatingAirports(mandayTime->operating_arr_airports);
						temp->addFleetLanding(mandayTime->fleetLanding);
						temp->addNightFleetLanding(mandayTime->nightFleetLanding);
					}
				}
				else if (mandayTime->types == CALCULATION_TYPES::WP) {
					temp->normal_wp = setValues;
				}
				else if (mandayTime->types == CALCULATION_TYPES::EXTEND_WP)
					temp->extend_wp = setValues;
				else if (mandayTime->types == CALCULATION_TYPES::PERDIEM)
					temp->PER_DIEM = setValues;
				else if (mandayTime->types == CALCULATION_TYPES::CUST_DP)
					temp->cust_dp = setValues;
				else if (mandayTime->types == CALCULATION_TYPES::DO)
					temp->DAY_OFF = DAY_OFF_EXIST;
				else if (mandayTime->types == CALCULATION_TYPES::ASB)
					temp->ASB = 1;
				else if (mandayTime->types == CALCULATION_TYPES::CSB)
					temp->CSB = 1;
				else if (mandayTime->types == CALCULATION_TYPES::GND) {
					temp->GND = 1;
					temp->groundDuration = (int)setValues;
					temp->credit += round(duration * mandayTime->credit_percentage);
					//temp->dp = setValues;
				}
				else if (mandayTime->types == CALCULATION_TYPES::HSB)
					temp->HSB = 1;
				else if (mandayTime->types == CALCULATION_TYPES::DHD)
					temp->IS_POSITION = 1;
				else if (mandayTime->types == CALCULATION_TYPES::LEA) {
					temp->LEAVE = 1;
					temp->leaveDuration = (int)setValues;
					temp->credit += duration * mandayTime->credit_percentage;
				}
				else if (mandayTime->types == CALCULATION_TYPES::SBY) {
					temp->STANDBY = 1;
					temp->standbyDuration = (int)setValues;
					temp->credit += duration * mandayTime->credit_percentage;
				}
				else if (mandayTime->types == CALCULATION_TYPES::AL) {
					if (gnteeFlyingHours < 0) {
						//未配置机组人员承包小时，通过AL时间累计计算
						temp->credit += duration * mandayTime->credit_percentage;
					}
					else if (temp->IS_AL < 1) {
						//配置机组人员承包小时，仅计算一次
						temp->credit += gnteeFlyingHours / 20.0;
					}

					temp->al += (int)setValues;
					temp->IS_AL = 1;
				}
				else if (mandayTime->types == CALCULATION_TYPES::HIGH_PLATEAU) {
					temp->HIGH_PLATEAU = (int)setValues;
					temp->credit += duration * mandayTime->credit_percentage;
				}
				// QQ独有，用custData定制字段
				else if (mandayTime->types == CALCULATION_TYPES::UA || mandayTime->types == CALCULATION_TYPES::GREY)
					temp->custData1 = 1;
				else if (mandayTime->types == CALCULATION_TYPES::RDO)
					temp->custData2 = 1;
				// TG 特殊字段，存放折算后的FT,大概一年后弃用
				else if (mandayTime->types == CALCULATION_TYPES::PFT)
					temp->custData1 = setValues;
				else if (mandayTime->types == CALCULATION_TYPES::SBY_DP)
					temp->SBY_DP = setValues;
				else if (mandayTime->types == CALCULATION_TYPES::DHD_DP)
					temp->DHD_DP = setValues;
				//20180922 ain, mantis#4131, 按manday.dateLoc汇总合并
				mResults.insert(make_pair(currentDayStartInUtc + mandayTimezoneMinutes * 60, temp));
			}
			else
			{
			if (mandayTime->types == CALCULATION_TYPES::BH) {
				singleResult->second->blh += setValues;
				singleResult->second->credit += duration * mandayTime->credit_percentage;
			}
			else if (mandayTime->types == CALCULATION_TYPES::DP)
				singleResult->second->dp += setValues;
			else if (mandayTime->types == CALCULATION_TYPES::FDP) {
				singleResult->second->fdp += setValues;
			}
			else if (mandayTime->types == CALCULATION_TYPES::FT) {
				singleResult->second->ft += setValues;
				singleResult->second->addOperatingFleets(mandayTime->operating_fleets);

				//若mandayTime跨天，则第一天(i==0)为经过起飞机场，最后一天(i == iDaysBetween - 1)为经过落地机场
				if (i == 0) {
					singleResult->second->addOperatingAirports(mandayTime->operating_dep_airports);
					singleResult->second->addFleetTakeoff(mandayTime->fleetTakeoff);
					singleResult->second->addNightFleetTakeoff(mandayTime->nightFleetTakeoff);
				}
				if (i == iDaysBetween - 1) {
					singleResult->second->addOperatingAirports(mandayTime->operating_arr_airports);
					singleResult->second->addFleetLanding(mandayTime->fleetLanding);
					singleResult->second->addNightFleetLanding(mandayTime->nightFleetLanding);
				}
			}
			else if (mandayTime->types == CALCULATION_TYPES::WP)
			{
				singleResult->second->normal_wp += setValues;
				if (singleResult->second->normal_wp > 600)
				{
					singleResult->second->extend_wp += (singleResult->second->normal_wp - 600);
					singleResult->second->normal_wp = 600;
				}
			}
			else if (mandayTime->types == CALCULATION_TYPES::EXTEND_WP)
				singleResult->second->extend_wp += setValues;
			else if (mandayTime->types == CALCULATION_TYPES::PERDIEM)
			{
				singleResult->second->PER_DIEM += setValues;
				//0003805: PH ADJUST超過24小時的處理
				//if (singleResult->second->PER_DIEM > 1440)
				//{
				//	printf("Exception, Perdiem>1440 in one day, check two half pair rosters , crew=%s.\n", singleResult->second->idCrew.c_str());
				//	if (singleResult->second->PER_DIEM > 9999)
				//		singleResult->second->PER_DIEM = 9999;
				//}
			}
			else if (mandayTime->types == CALCULATION_TYPES::CUST_DP)
				singleResult->second->cust_dp += setValues;
			else if (mandayTime->types == CALCULATION_TYPES::DO)
				singleResult->second->DAY_OFF = DAY_OFF_EXIST;
			else if (mandayTime->types == CALCULATION_TYPES::ASB)
				singleResult->second->ASB = 1;
			else if (mandayTime->types == CALCULATION_TYPES::CSB)
				singleResult->second->CSB = 1;
			else if (mandayTime->types == CALCULATION_TYPES::GND) {
				singleResult->second->GND = 1;
				singleResult->second->groundDuration += (int)setValues;
				singleResult->second->credit += duration * mandayTime->credit_percentage;
				//singleResult->second->dp += round(setValues * mandayTime->percentage);
			}
			else if (mandayTime->types == CALCULATION_TYPES::HSB)
				singleResult->second->HSB = 1;
			else if (mandayTime->types == CALCULATION_TYPES::DHD)
				singleResult->second->IS_POSITION = 1;
			else if (mandayTime->types == CALCULATION_TYPES::LEA) {
				singleResult->second->LEAVE = 1;
				singleResult->second->leaveDuration += (int)setValues;
				singleResult->second->credit += duration * mandayTime->credit_percentage;
			}
				
			else if (mandayTime->types == CALCULATION_TYPES::SBY) {
				singleResult->second->STANDBY = 1;
				singleResult->second->standbyDuration += (int)setValues;
				singleResult->second->credit += duration * mandayTime->credit_percentage;
			}
			else if (mandayTime->types == CALCULATION_TYPES::AL) {
				if (gnteeFlyingHours < 0) {
					//未配置机组人员承包小时，通过AL时间累计计算
					singleResult->second->credit += duration * mandayTime->credit_percentage;
				}
				else if (singleResult->second->IS_AL < 1) {
					//配置机组人员承包小时，仅计算一次
					singleResult->second->credit += gnteeFlyingHours / 20.0;
				}
				singleResult->second->al += (int)setValues;
				singleResult->second->IS_AL = 1;
			}
			else if (mandayTime->types == CALCULATION_TYPES::HIGH_PLATEAU) {
				singleResult->second->HIGH_PLATEAU += (int)setValues;
				singleResult->second->credit += duration * mandayTime->credit_percentage;
			}
			else if (mandayTime->types == CALCULATION_TYPES::UA || mandayTime->types == CALCULATION_TYPES::GREY)
				singleResult->second->custData1 = 1;
			else if (mandayTime->types == CALCULATION_TYPES::RDO)
				singleResult->second->custData2 = 1;
			// TG 特殊字段，存放折算后的FT,大概一年后弃用
			else if (mandayTime->types == CALCULATION_TYPES::PFT)
				singleResult->second->custData1 += setValues;
			else if (mandayTime->types == CALCULATION_TYPES::SBY_DP)
				singleResult->second->SBY_DP += setValues;
			else if (mandayTime->types == CALCULATION_TYPES::DHD_DP)
				singleResult->second->DHD_DP += setValues;
			}
		}
	}
	///TEST
	//{
	//	////log：辅助调试manday calculate，观察目标crew mandayTimes[] 和 rosters[]数据
	//	if (!rosters.empty() && (rosters[0]->idcrew == "RY1308005" || rosters[0]->idcrew == "351387" || rosters[0]->idcrew == "243303")) {
	//		printf("\n");
	//		for (auto& it : mResults) {
	//			auto& mday = it.second;
	//			if (it.first > utcStrToUtc("2021-6-11") && it.first < utcStrToUtc("2021-6-21"))
	//				printf("manday result %s %s blh=%d dp=%d ph=%d sby=%d\n", 
	//				mday->idCrew.c_str(), utcToUtcString(mday->dateLoc).c_str(), mday->blh, mday->dp, mday->PER_DIEM, mday->STANDBY);
	//		}
	//	}
	//}
	//mantis#3047, 按 normal_wp上限10小时, 后续部分计入extend_wp修正 manday.wp
	//修正 normal_wp --> extend_wp
	/*该逻辑已被覆盖。20180618*/
	//for (auto& it : mResults) {
	//	if (it.second->normal_wp > 600) {
	//		it.second->extend_wp += (it.second->normal_wp - 600);
	//		it.second->normal_wp = 600;
	//	}
	//}

	//20180922 ain, mantis#4131, 注释代码, 不再按crew_baes计算dateLoc, 改为生成manday时立即创建以便跟随不同类型roster切天时区逻辑不同
	//20180605 ain, mantis#3401, 计算 manday.dateLoc, 用于按 localDate汇总manday
	//for (auto& it : mResults) {
	//	auto& mday = it.second;
	//	int offsetHour = _dbData->getDefaultTimeZone();
	//	if (this->_dbData->crewIdMap.find(it.second->idCrew) != this->_dbData->crewIdMap.end()) {
	//		auto& crew = this->_dbData->crewIdMap[it.second->idCrew];
	//		offsetHour = crew->crewBaseTimezoneOffsetIndex->getHourOffset(mday->crewDateUtc);
	//	}
	//	if (offsetHour == 0)
	//		mday->dateLoc = mday->crewDateUtc;
	//	else if (offsetHour > 0)
	//		mday->dateLoc = getStartTimeOfDay(mday->crewDateUtc) + 24 * 3600;
	//	else // offsetHour < 0
	//		mday->dateLoc = getStartTimeOfDay(mday->crewDateUtc) - 24 * 3600;
	//}

	//计算credit，并合并到manday中
	calculateManDayCredit(mResults, rosters, setCalculated);
    if (this->_ruleEngine->GetApplication() != ROSTER_OPTIMIZER) {
        //计算PerDiem，并合并到manday中
        calculateManDayPerDiem(mResults, rosters, setCalculated);

        //计算Working Hour，并合并到manday中
        calculateManDayWorkingHour(mResults, rosters, setCalculated);
    }

	//计算layover_day，并合并到manday中
	calculateMandayLayoverDay(mResults, rosters, setCalculated);

	//计算Duty Aloft(机组在飞机上时间)
	calculateManDayDutyAloft(mResults, rosters, setCalculated);

	calculateMandayBLH(mResults, rosters, setCalculated);

	calculateAugAndIntBlh(mResults, rosters, setCalculated);

	calculateBLHByDictionary(mResults, rosters, setCalculated);

	calculateMandayAttribute(mResults, rosters, setCalculated);

	calculateMandayFlightNumber(mResults, rosters, setCalculated);

	calculateMandayRadiationDose(mResults, rosters, setCalculated);

    //计算跨时区Duty的数量(HX需求：记录跨时区6小时及以上Duty数量）
	calculateCrossTZDutyCount(mResults, rosters, setCalculated);

	//计算DDO(HX需求：统计DDO数量以及标识是否跨时区6小时第一个DDO）
	calculateMandayDDO(mResults, rosters, setCalculated);

	return mResults;
}

void BasicCalculation::calculateManDayCredit(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	//7215 ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD 和 7224 ROSTER_FREIGHTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD
	calculateManDayCreditForEvaFd(mResults, rosters, setCalculated);

	//7328 CALC_CREDIT_HOURS_FOR_PR
	calculateManDayCreditForPR(mResults, rosters, setCalculated);

	//7502 CALC_CREDIT_HOURS_FOR_CARS
	calculateManDayCreditForCARS(mResults, rosters, setCalculated);
}

void BasicCalculation::calculateManDayCreditForEvaFd(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	if (rosters.empty()) {
		return;
	}
	auto& rules = _dbData->getRuleFunctions(RULES::ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD);
	auto& freighterRules = _dbData->getRuleFunctions(RULES::ROSTER_FREIGHTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD);
	if (rules.empty() && freighterRules.empty()) {
		return;
	}
	
	clock_t lapsed = clock();
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto iterCrew = this->_dbData->crewIdMap.find(idCrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	//计算manday的credit, std::tuple<map<localDay, credit>, map<pairingId, credit>>
	//std::tuple<map<time_t, MandayCreditHour>, map<rosterId, Pairing CreditHour>, map<rosterId, Segment CreditHour>>
	auto [mandayCreditMap, rosterCreditMap, segmentCreditMap] = _ruleEngine->getCreditHoursMandayForEvaFd(rosters);

	clock_t lpased2 = clock();
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD, (lpased2 - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD, 1);

	lapsed = clock();
	//获得货机的credit
	auto [mandayFreighterCreditMap, rosterFreighterCreditMap, segmentFreighterCreditMap] = _ruleEngine->getFreighterCreditHoursMandayForEvaFd(rosters);

	lpased2 = clock();
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::ROSTER_FREIGHTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD, (lpased2 - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::ROSTER_FREIGHTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD, 1);

	if (mandayCreditMap.empty() && mandayFreighterCreditMap.empty()) {
		return;
	}

	for (auto& kv : mandayCreditMap) {
		time_t localDay = kv.first;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			mResults.insert(std::make_pair(localDay, manday));
		}
	}

	for (auto& kv : mandayFreighterCreditMap) {
		time_t localDay = kv.first;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			mResults.insert(std::make_pair(localDay, manday));
		}
	}

	//合并credit到已有的manday中
	for (auto& pairResult : mResults) {
		pairResult.second->credit = 0;
		pairResult.second->credit_pnc = 0;
		pairResult.second->credit_sim = 0;
		pairResult.second->credit_al = 0;
		pairResult.second->credit_ol = 0;
		pairResult.second->credit_freighter = 0;
		pairResult.second->sch_credit = 0;
		pairResult.second->sch_credit_pnc = 0;
		pairResult.second->sch_credit_sim = 0;
		pairResult.second->sch_credit_al = 0;
		pairResult.second->sch_credit_ol = 0;
		pairResult.second->sch_credit_freighter = 0;
		
		auto iterMandayCredit = mandayCreditMap.find(pairResult.first);
		if (iterMandayCredit != mandayCreditMap.end()) {
			auto& mandayCredit = iterMandayCredit->second;
			pairResult.second->credit = mandayCredit.actCreditInMins;
			pairResult.second->sch_credit = mandayCredit.schCreditInMins;

			auto& actAssignmentCreditMap = mandayCredit.actAssCreditInMinsMap;
			for (auto& pair : actAssignmentCreditMap) {
				auto& assignment = pair.first;
				auto& assignmentActCredit = pair.second;
				if (assignment == "DHD" || assignment == "PNC") {
					pairResult.second->credit_pnc += assignmentActCredit;
				}
				else if (assignment == "SIM") {
					pairResult.second->credit_sim += assignmentActCredit;
				}
				else if (assignment == "AL") {
					pairResult.second->credit_al += assignmentActCredit;
				}
				else if (assignment == "OL") {
					pairResult.second->credit_ol += assignmentActCredit;
				}
			}

			auto& schAssignmentCreditMap = mandayCredit.schAssCreditInMinsMap;
			for (auto& pair : schAssignmentCreditMap) {
				auto& assignment = pair.first;
				auto& assignmentSchCredit = pair.second;
				if (assignment == "DHD" || assignment == "PNC") {
					pairResult.second->sch_credit_pnc += assignmentSchCredit;
				}
				else if (assignment == "SIM") {
					pairResult.second->sch_credit_sim += assignmentSchCredit;
				}
				else if (assignment == "AL") {
					pairResult.second->sch_credit_al += assignmentSchCredit;
				}
				else if (assignment == "OL") {
					pairResult.second->sch_credit_ol += assignmentSchCredit;
				}
			}

		}

		auto iterMandayFreighterCredit = mandayFreighterCreditMap.find(pairResult.first);
		if (iterMandayFreighterCredit != mandayFreighterCreditMap.end()) {
			auto& mandayCredit = iterMandayFreighterCredit->second;
			pairResult.second->credit_freighter = mandayCredit.actCreditInMins;
			pairResult.second->sch_credit_freighter = mandayCredit.schCreditInMins;
		}
	}

	//填写roster的credit
	for (auto& roster : rosters) {
		auto iter = rosterCreditMap.find(roster->rosterId);
		if (iter != rosterCreditMap.end()) {
			auto& pairingCreditHour = iter->second;
			roster->creditMinutes = pairingCreditHour.actCreditInMins;
			roster->fmCreditMinutes = pairingCreditHour.actFirstMonthCreditInMins;
			roster->schCreditMinutes = pairingCreditHour.schCreditInMins;
			roster->schFmCreditMinutes = pairingCreditHour.schFirstMonthCreditInMins;
		}
	}

	for (auto& pair : segmentCreditMap) {
		auto rosterId = pair.first;
		auto& segmentMap = pair.second;
		for (auto& pairSegment : segmentMap) {
			auto& segmentCreditHour = pairSegment.second;
			auto rf = this->_dbData->rosterFlightMgr.get(segmentCreditHour.flightId, idCrew);
			if (rf == nullptr) continue;
			rf->creditedInSec = (int)(segmentCreditHour.actCreditInMins * 60);
			rf->fmCreditedInSec = (int)(segmentCreditHour.actFirstMonthCreditInMins * 60);
			rf->schCreditedInSec = (int)(segmentCreditHour.schCreditInMins * 60);
			rf->schFmCreditedInSec = (int)(segmentCreditHour.schFirstMonthCreditInMins * 60);
		}
	}
}

void BasicCalculation::calculateManDayCreditForPR(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	auto& rules = _dbData->getRuleFunctions(RULES::CALC_CREDIT_HOURS_FOR_PR);
	if (rules.empty() || rosters.empty()) {
		return;
	}

	clock_t lapsed = clock();
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto iterCrew = this->_dbData->crewIdMap.find(idCrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	//计算manday的credit, std::tuple<map<localDay, credit>, map<pairingId, credit>>
	//std::tuple<map<time_t, MandayCreditHour>, map<rosterId, Pairing CreditHour>, map<rosterId, Segment CreditHour>>
	auto [mandayCreditMap, rosterCreditMap, segmentCreditMap] = _ruleEngine->getCreditHoursMandayForPR(rosters);

	clock_t lpased2 = clock();
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::CALC_CREDIT_HOURS_FOR_PR, (lpased2 - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::CALC_CREDIT_HOURS_FOR_PR, 1);

	lapsed = clock();

	if (mandayCreditMap.empty()) {
		return;
	}

	for (auto& kv : mandayCreditMap) {
		time_t localDay = kv.first;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			mResults.insert(std::make_pair(localDay, manday));
		}
	}

	//合并credit到已有的manday中
	for (auto& pairResult : mResults) {
		pairResult.second->credit = 0;
		pairResult.second->credit_pnc = 0;
		pairResult.second->credit_sim = 0;
		pairResult.second->credit_al = 0;
		pairResult.second->credit_ol = 0;
		pairResult.second->credit_freighter = 0;
		pairResult.second->sch_credit = 0;
		pairResult.second->sch_credit_pnc = 0;
		pairResult.second->sch_credit_sim = 0;
		pairResult.second->sch_credit_al = 0;
		pairResult.second->sch_credit_ol = 0;
		pairResult.second->sch_credit_freighter = 0;

		auto iterMandayCredit = mandayCreditMap.find(pairResult.first);
		if (iterMandayCredit != mandayCreditMap.end()) {
			auto& mandayCredit = iterMandayCredit->second;
			pairResult.second->credit = mandayCredit.actCreditInMins;
			pairResult.second->sch_credit = mandayCredit.schCreditInMins;

			auto& actAssignmentCreditMap = mandayCredit.actAssCreditInMinsMap;
			for (auto& pair : actAssignmentCreditMap) {
				auto& assignment = pair.first;
				auto& assignmentActCredit = pair.second;
				if (assignment == "DHD" || assignment == "PNC") {
					pairResult.second->credit_pnc += assignmentActCredit;
				}
				else if (assignment == "SIM") {
					pairResult.second->credit_sim += assignmentActCredit;
				}
				else if (assignment == "AL") {
					pairResult.second->credit_al += assignmentActCredit;
				}
				else if (assignment == "OL") {
					pairResult.second->credit_ol += assignmentActCredit;
				}
			}

			auto& schAssignmentCreditMap = mandayCredit.schAssCreditInMinsMap;
			for (auto& pair : schAssignmentCreditMap) {
				auto& assignment = pair.first;
				auto& assignmentSchCredit = pair.second;
				if (assignment == "DHD" || assignment == "PNC") {
					pairResult.second->sch_credit_pnc += assignmentSchCredit;
				}
				else if (assignment == "SIM") {
					pairResult.second->sch_credit_sim += assignmentSchCredit;
				}
				else if (assignment == "AL") {
					pairResult.second->sch_credit_al += assignmentSchCredit;
				}
				else if (assignment == "OL") {
					pairResult.second->sch_credit_ol += assignmentSchCredit;
				}
			}

		}

	}

	//填写roster的credit
	for (auto& roster : rosters) {
		auto iter = rosterCreditMap.find(roster->rosterId);
		if (iter != rosterCreditMap.end()) {
			auto& pairingCreditHour = iter->second;
			roster->creditMinutes = pairingCreditHour.actCreditInMins;
			roster->fmCreditMinutes = pairingCreditHour.actFirstMonthCreditInMins;
			roster->schCreditMinutes = pairingCreditHour.schCreditInMins;
			roster->schFmCreditMinutes = pairingCreditHour.schFirstMonthCreditInMins;
		}
	}

	for (auto& pair : segmentCreditMap) {
		auto rosterId = pair.first;
		auto& segmentMap = pair.second;
		for (auto& pairSegment : segmentMap) {
			auto& segmentCreditHour = pairSegment.second;
			auto rf = this->_dbData->rosterFlightMgr.get(segmentCreditHour.flightId, idCrew);
			if (rf == nullptr) continue;
			rf->creditedInSec = (int)(segmentCreditHour.actCreditInMins * 60);
			rf->fmCreditedInSec = (int)(segmentCreditHour.actFirstMonthCreditInMins * 60);
			rf->schCreditedInSec = (int)(segmentCreditHour.schCreditInMins * 60);
			rf->schFmCreditedInSec = (int)(segmentCreditHour.schFirstMonthCreditInMins * 60);
		}
	}
}

void BasicCalculation::calculateManDayCreditForCARS(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	auto& rules = _dbData->getRuleFunctions(RULES::CALC_CREDIT_HOURS_FOR_CARS);
	if (rules.empty() || rosters.empty()) {
		return;
	}

	clock_t lapsed = clock();
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto iterCrew = this->_dbData->crewIdMap.find(idCrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	//计算manday的credit, std::tuple<map<localDay, credit>, map<pairingId, credit>>
	//std::tuple<map<time_t, MandayCreditHour>, map<rosterId, Pairing CreditHour>, map<rosterId, Segment CreditHour>>
	auto [mandayCreditMap, rosterCreditMap, segmentCreditMap] = _ruleEngine->getCreditHoursMandayForCARS(rosters);

	clock_t lpased2 = clock();
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::CALC_CREDIT_HOURS_FOR_CARS, (lpased2 - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::CALC_CREDIT_HOURS_FOR_CARS, 1);

	lapsed = clock();

	if (mandayCreditMap.empty()) {
		return;
	}

	for (auto& kv : mandayCreditMap) {
		time_t localDay = kv.first;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			mResults.insert(std::make_pair(localDay, manday));
		}
	}

	//合并credit到已有的manday中
	for (auto& pairResult : mResults) {
		pairResult.second->credit = 0;
		pairResult.second->credit_pnc = 0;
		pairResult.second->credit_sim = 0;
		pairResult.second->credit_al = 0;
		pairResult.second->credit_ol = 0;
		pairResult.second->credit_freighter = 0;
		pairResult.second->sch_credit = 0;
		pairResult.second->sch_credit_pnc = 0;
		pairResult.second->sch_credit_sim = 0;
		pairResult.second->sch_credit_al = 0;
		pairResult.second->sch_credit_ol = 0;
		pairResult.second->sch_credit_freighter = 0;

		auto iterMandayCredit = mandayCreditMap.find(pairResult.first);
		if (iterMandayCredit != mandayCreditMap.end()) {
			auto& mandayCredit = iterMandayCredit->second;
			pairResult.second->credit = mandayCredit.actCreditInMins;
			pairResult.second->sch_credit = mandayCredit.schCreditInMins;

			auto& actAssignmentCreditMap = mandayCredit.actAssCreditInMinsMap;
			for (auto& pair : actAssignmentCreditMap) {
				auto& assignment = pair.first;
				auto& assignmentActCredit = pair.second;
				if (assignment == "DHD" || assignment == "PNC") {
					pairResult.second->credit_pnc += assignmentActCredit;
				}
				else if (assignment == "SIM") {
					pairResult.second->credit_sim += assignmentActCredit;
				}
				else if (assignment == "AL") {
					pairResult.second->credit_al += assignmentActCredit;
				}
				else if (assignment == "OL") {
					pairResult.second->credit_ol += assignmentActCredit;
				}
			}

			auto& schAssignmentCreditMap = mandayCredit.schAssCreditInMinsMap;
			for (auto& pair : schAssignmentCreditMap) {
				auto& assignment = pair.first;
				auto& assignmentSchCredit = pair.second;
				if (assignment == "DHD" || assignment == "PNC") {
					pairResult.second->sch_credit_pnc += assignmentSchCredit;
				}
				else if (assignment == "SIM") {
					pairResult.second->sch_credit_sim += assignmentSchCredit;
				}
				else if (assignment == "AL") {
					pairResult.second->sch_credit_al += assignmentSchCredit;
				}
				else if (assignment == "OL") {
					pairResult.second->sch_credit_ol += assignmentSchCredit;
				}
			}

		}

	}

	//填写roster的credit
	for (auto& roster : rosters) {
		auto iter = rosterCreditMap.find(roster->rosterId);
		if (iter != rosterCreditMap.end()) {
			auto& pairingCreditHour = iter->second;
			roster->creditMinutes = pairingCreditHour.actCreditInMins;
			roster->fmCreditMinutes = pairingCreditHour.actFirstMonthCreditInMins;
			roster->schCreditMinutes = pairingCreditHour.schCreditInMins;
			roster->schFmCreditMinutes = pairingCreditHour.schFirstMonthCreditInMins;
		}
	}

	for (auto& pair : segmentCreditMap) {
		auto rosterId = pair.first;
		auto& segmentMap = pair.second;
		for (auto& pairSegment : segmentMap) {
			auto& segmentCreditHour = pairSegment.second;
			auto rf = this->_dbData->rosterFlightMgr.get(segmentCreditHour.flightId, idCrew);
			if (rf == nullptr) continue;
			rf->creditedInSec = (int)(segmentCreditHour.actCreditInMins * 60);
			rf->fmCreditedInSec = (int)(segmentCreditHour.actFirstMonthCreditInMins * 60);
			rf->schCreditedInSec = (int)(segmentCreditHour.schCreditInMins * 60);
			rf->schFmCreditedInSec = (int)(segmentCreditHour.schFirstMonthCreditInMins * 60);
		}
	}
}

void BasicCalculation::calculateManDayPerDiem(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	auto& rules = _dbData->getRuleFunctions(RULES::PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD);
	if (rules.empty() || rosters.empty()) {
		return;
	}
	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	clock_t lapsed = clock();

	//计算manday的PerDiem, map<localDay,PerDiem>
	auto [mandayPerDiemMap, rosterPerDiemMap] = _ruleEngine->getPerDiemHourForEvaFd(rosters);

	//合并perdiem到已有的manday中，先清空（避免其他法规影响）然后再赋值
	for (auto& pairResult : mResults) {
		pairResult.second->PER_DIEM = 0;
		pairResult.second->LONG_PER_DIEM = 0;
		pairResult.second->SCH_PER_DIEM = 0;
		pairResult.second->SCH_LONG_PER_DIEM = 0;
	}

	for (auto& pairPerDiem : mandayPerDiemMap) {
		time_t localDay = pairPerDiem.first;
		auto& mandayPerDiem = pairPerDiem.second;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			manday->PER_DIEM = mandayPerDiem.actPerDiemInMins;
			manday->LONG_PER_DIEM = mandayPerDiem.actLongPerDiemInMins;
			manday->SCH_PER_DIEM = mandayPerDiem.schPerDiemInMins;
			manday->SCH_LONG_PER_DIEM = mandayPerDiem.schLongPerDiemInMins;
			mResults.insert(std::make_pair(localDay, manday));
		}
		else {
			iterManday->second->PER_DIEM = mandayPerDiem.actPerDiemInMins;
			iterManday->second->LONG_PER_DIEM = mandayPerDiem.actLongPerDiemInMins;
			iterManday->second->SCH_PER_DIEM = mandayPerDiem.schPerDiemInMins;
			iterManday->second->SCH_LONG_PER_DIEM = mandayPerDiem.schLongPerDiemInMins;
		}
	}

	//填写roster的perdiem字段
	for (auto& roster : rosters) {
		auto iter = rosterPerDiemMap.find(roster->rosterId);
		if (iter != rosterPerDiemMap.end()) {
			auto& perDiem = iter->second;
			roster->perDiemMins = perDiem.actPerDiemInSec / 60.0;
			roster->lhPerDiemMins = perDiem.actLongPerDiemInSec / 60.0;
			roster->fmPerDiemMins = perDiem.actFirstMonthPerDiemInSec / 60.0;
			roster->fmLhPerDiemMins = perDiem.actFirstMonthLongPerDiemInSec / 60.0;

			roster->schPerDiemMins = perDiem.schPerDiemInSec / 60.0;
			roster->schLhPerDiemMins = perDiem.schLongPerDiemInSec / 60.0;
			roster->schFmPerDiemMins = perDiem.schFirstMonthPerDiemInSec / 60.0;
			roster->schFmLhPerDiemMins = perDiem.schFirstMonthLongPerDiemInSec / 60.0;
		}
	}

	clock_t lpased2 = clock();
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD, (lpased2 - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD, 1);
}

void BasicCalculation::calculateMandayLayoverDay(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	if (rosters.empty())
		return;
	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);
	for (const auto& roster : rosters) {
		if (roster->pairing) {
			if (roster->pairing->getDutyVec().size() < 2)
				continue;

			const auto& duties = roster->pairing->getDutyVec();
			for (size_t i = 0; i < duties.size() - 1; i++) {
				const auto& checkStart = duties[i]->getLastDropoff()->getEndTimeUtcAct() + offsetTZMinutes * 60;
				const auto& checkEnd = duties[i + 1]->getFirstPickup()->getStartTimeUtcAct() + offsetTZMinutes * 60;

				const auto& startOfCheckStart = getStartTimeOfDay(checkStart);
				//计算manday的layover_day
				const auto& days = TimeUtils::CalculateFullDaysBetweenTimes(checkStart, checkEnd);
				if (days > 0) {
					bool isStartOfDay = checkStart % (24 * 3600) == 0;
					auto startDay = isStartOfDay ? startOfCheckStart : startOfCheckStart + 3600 * 24;
					for (int j = 0; j < days; j++) {
						const auto& date = startDay + (time_t)j * 3600 * 24;
						auto iterManday = mResults.find(date);
						if (iterManday == mResults.end()) {
							SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
							manday->idCrew = crew->idCrew;
							manday->dateLoc = date;
							manday->crewDateUtc = date - offsetTZMinutes * 60;
							manday->layover_day = 1;
							mResults.insert(std::make_pair(date, manday));
						}
						else {
							iterManday->second->layover_day = 1;
						}
					}
				}

				//计算manday的layoverTimes、layoverDuration
				auto iterManday = mResults.find(startOfCheckStart);
				if (iterManday == mResults.end()) {
					SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
					manday->idCrew = crew->idCrew;
					manday->dateLoc = startOfCheckStart;
					manday->crewDateUtc = startOfCheckStart - offsetTZMinutes * 60;
					manday->layoverTimes = 1;
                    manday->layoverDuration = (int)((checkEnd - checkStart) / 60);
					mResults.insert(std::make_pair(startOfCheckStart, manday));
				}
				else {
					iterManday->second->layoverTimes++;
					iterManday->second->layoverDuration += (int)((checkEnd - checkStart) / 60);
				}
				//增加防护，如果layoverDuration超过9999分钟，则记录日志并将layoverDuration设置为9999
				auto iterMandayCheck = mResults.find(startOfCheckStart);
				if (iterMandayCheck != mResults.end()) {
					if (iterMandayCheck->second->layoverDuration > 9999) {
						iterMandayCheck->second->layoverDuration = 9999;
						Logger::getRuleLogger()->error("Layover duration exceeds max value for crew {}, dateLoc {}", crew->idCrew, iterMandayCheck->second->dateLoc);
					}
				}
			}
		}
	}
}

void BasicCalculation::calculateManDayWorkingHour(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	auto& rules = _dbData->getRuleFunctions(RULES::WORKING_HOUR_DEFINITION_FOR_EVA_FD);
	if (rules.empty() || rosters.empty()) {
		return;
	}
	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}

	clock_t lapsed = clock();

	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	//计算manday的WorkingHour, map<localDay,WorkingHour>, map<rosterId, WorkingHour>
	auto [mandayWorkingHourMap, rosterWorkingHourMap] = _ruleEngine->getWorkingHourForEvaFd(rosters);
	
	for (auto& kv : mandayWorkingHourMap) {
		time_t localDay = kv.first;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			mResults.insert(std::make_pair(localDay, manday));
		}
	}

	//合并perdiem到已有的manday中，先清空（避免其他法规影响）然后再赋值
	for (auto& pairResult : mResults) {
		pairResult.second->workingHour = 0;
		pairResult.second->schWorkingHour = 0;
	}

	for (auto& workingHour : mandayWorkingHourMap) {
		auto iterManday = mResults.find(workingHour.first);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = workingHour.first;
			manday->crewDateUtc = workingHour.first - (time_t)offsetTZMinutes * 60;
			manday->workingHour = workingHour.second;
			manday->schWorkingHour = workingHour.second;
			mResults.insert(std::make_pair(workingHour.first, manday));
		}
		else {
			iterManday->second->workingHour = workingHour.second;
			iterManday->second->schWorkingHour = workingHour.second;
		}
	}

	//填写roster的workingHour
	for (auto& roster : rosters) {
		auto iter = rosterWorkingHourMap.find(roster->rosterId);
		if (iter != rosterWorkingHourMap.end()) {
			auto& rosterWorkingHour = iter->second;
			roster->workingHour = rosterWorkingHour;
			roster->schWorkingHour = rosterWorkingHour;
		}
	}

	clock_t lpased2 = clock();
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::WORKING_HOUR_DEFINITION_FOR_EVA_FD, (lpased2 - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::WORKING_HOUR_DEFINITION_FOR_EVA_FD, 1);
}

void BasicCalculation::calculateManDayDutyAloft(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	auto& rules = _dbData->getRuleFunctions(RULES::CALC_DUTY_ALOFT_FOR_PR);
	if (rules.empty() || rosters.empty()) {
		return;
	}

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}

	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	//计算manday的Duty Aloft(机组在飞机上时间)
	auto mandayDutyAloftMap= _ruleEngine->getDutyAloftMandayForPR(rosters);

	if (mandayDutyAloftMap.empty()) {
		return;
	}

	for (auto& kv : mandayDutyAloftMap) {
		time_t localDay = kv.first;
		auto iterManday = mResults.find(localDay);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = localDay;
			manday->crewDateUtc = localDay - (time_t)offsetTZMinutes * 60;
			mResults.insert(std::make_pair(localDay, manday));
		}
	}

	//合并Duty Aloft(机组在飞机上时间)到已有的manday中
	for (auto& pairResult : mResults) {
		pairResult.second->custData1 = 0;

		auto iterMandayDutyAloft = mandayDutyAloftMap.find(pairResult.first);
		if (iterMandayDutyAloft != mandayDutyAloftMap.end()) {
			auto dutyAloft = iterMandayDutyAloft->second;
			pairResult.second->custData1 = dutyAloft;

		}
	}
}

void BasicCalculation::calculateMandayAttribute(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	for (const auto& roster : rosters) {
		time_t date = 0;
		string attribute = "";
		if (!roster->pairing) {
			date = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->getStartTimeUtcAct(), crewBaseOffsetMinutes) + crewBaseOffsetMinutes * 60;
			attribute = roster->attribute;
		}
		else {
			date = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->pairing->getStartTimeUtcAct(), crewBaseOffsetMinutes) + crewBaseOffsetMinutes * 60;
			attribute = roster->pairing->getAttribute();
		}
		if (date != 0 && !attribute.empty()) {
			if (mResults.find(date) != mResults.end()) {
				if (mResults[date]->attributes.empty()) {
					mResults[date]->attributes = attribute;
				}
				else {
					mResults[date]->attributes += "|" + attribute;
				}
			}
			else {
				SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
				manday->idCrew = this->_crew->idCrew;
				manday->dateLoc = date;
				manday->crewDateUtc = date;
				manday->attributes = attribute;
				mResults.insert(std::make_pair(date, manday));
			}
		}
		
	}
}

//计算当天运行飞行航班数量
void BasicCalculation::calculateMandayFlightNumber(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	for (const auto& roster : rosters) {
		if (!roster->pairing) {
			continue;
		}

		const auto& duties = roster->pairing->getDutyVec();

		for (const auto& duty : duties) {
			const auto& segments = duty->getSegmentsRead();

			for (const auto& segment : segments) {
				if (!segment->getIsOperating()) {
					continue;
				}

				const auto& date = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getStartTimeUtcSch(), crewBaseOffsetMinutes) + crewBaseOffsetMinutes * 60;

				if (mResults.find(date) != mResults.end()) {
					mResults[date]->fltNum += 1;
				}
				else {
					SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
					manday->idCrew = this->_crew->idCrew;
					manday->dateLoc = date;
					manday->crewDateUtc = date;
					manday->fltNum = 1;
					mResults.insert(std::make_pair(date, manday));
				}
			}
		}
	}
}

//计算宇宙射线
void BasicCalculation::calculateMandayRadiationDose(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	for (const auto& roster : rosters) {
		if (!roster->pairing) {
			continue;
		}

		const auto& duties = roster->pairing->getDutyVec();

		for (const auto& duty : duties) {
			const auto& segments = duty->getSegmentsRead();

			for (const auto& segment : segments) {

				//取时间ATD -> ETD -> STD
				time_t start = segment->getStartTimeUtcAct() ? segment->getStartTimeUtcAct() : segment->getEstDepDtUtc() ? segment->getEstDepDtUtc() : segment->getStartTimeUtcSch();
				time_t end = segment->getEndTimeUtcAct() ? segment->getEndTimeUtcAct() : segment->getEstArvDtUtc() ? segment->getEstArvDtUtc() : segment->getEndTimeUtcSch();
				//根据航班的开始结束时间，如果跨天，则分摊到各个manday中
				const auto& startDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, crewBaseOffsetMinutes) + crewBaseOffsetMinutes * 60;
				const auto& endDate = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, crewBaseOffsetMinutes) + crewBaseOffsetMinutes * 60;
				if (endDate > startDate) {
					//跨天,按照时间比例分摊辐射剂量,可能存在前一天和后一天宇宙射线值不同的情况
					const auto& totalSeconds = end - start;
					const auto& totalDays = (endDate - startDate) / (24 * 3600);
					for (time_t date = startDate; date <= endDate; date += 24 * 3600) {


						time_t segStart = start + crewBaseOffsetMinutes * 60;
						time_t segEnd = end + crewBaseOffsetMinutes * 60;
						if (date > startDate) {
							segStart = date;
						}
						if (date + 24 * 3600 < endDate + 24 * 3600) {
							segEnd = date + 24 * 3600;
						}

						double radiationDose = this->_dbData->getRouteRadiationConfigBySegmentAndTime(segment, date);

						if (radiationDose <= 0) {
							continue;
						}
						const auto& segSeconds = segEnd - segStart;
						const auto& segRadiationDose = radiationDose * ((double)segSeconds / (double)totalSeconds);

						if (mResults.find(date) != mResults.end()) {
							mResults[date]->radiationDose += Utility::round(segRadiationDose, 3);
						}
						else {
							SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
							manday->idCrew = this->_crew->idCrew;
							manday->dateLoc = date;
							manday->crewDateUtc = date;
							manday->radiationDose = segRadiationDose;
							mResults.insert(std::make_pair(date, manday));
						}
					}
					continue;
				
				}
				else {
					//不跨天

					double radiationDose = this->_dbData->getRouteRadiationConfigBySegment(segment);

					if (radiationDose < 0)
						continue;
					const auto& date = startDate;
					if (mResults.find(date) != mResults.end()) {
						mResults[date]->radiationDose += radiationDose;
					}
					else {
						SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
						manday->idCrew = this->_crew->idCrew;
						manday->dateLoc = date;
						manday->crewDateUtc = date;
						manday->radiationDose = radiationDose;
						mResults.insert(std::make_pair(date, manday));
					}
				}

			}
		}
	}
}

void BasicCalculation::calculateMandayBLH(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	const auto& mode = _dbData->getSystemParamValue("SPLIT_MANDAY_MODE");
	if (mode == "")
		return;

	const auto& timezone = _dbData->getSystemParamValue("CREW_MANDAY_STORE_TIMEZONE");
	if (timezone == "")
		return;

	const auto& baiscComposition = _dbData->getSystemParamValue("BASIC_COMPOSITION_NAME");

	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	//string divide = this->_dbData->systemParamMap["DIVIDE_CREW_MANDAY"];

	int calcOffsetMinutes = 0;
	string zoneId = "";
	if (timezone == "CREW_BASE") {
		zoneId = this->_dbData->airportZoneIdMap[base];
		calcOffsetMinutes = crewBaseOffsetMinutes;
	}

	//清空blh
	for (auto& result : mResults) {
		result.second->blh = 0;
		result.second->ft = 0;
	}

	for (const auto& roster : rosters) {
		if (!roster->pairing)
			continue;

		const auto & duties = roster->pairing->getDutyVec();
		time_t firstFlyStart = 0;
		for (const auto& duty : duties) {
			long blk = 0;
			long ft = 0;
			long intBlh = 0;
			long augBlh = 0;
			const auto& segments = duty->getSegmentsRead();
			for (const auto& segment : segments) {
                auto iterAssignment = _dbData->assignmentNameMap.find(segment->getAssignment());
				if (iterAssignment == _dbData->assignmentNameMap.end()) {
					continue;
				}

				const auto& dbAssignment = iterAssignment->second;

				if (!dbAssignment)
					continue;

				bool augFlight = true;
				string composition = SegmentUtils::GetCompositionBySegmentFor3(segment, this->_dbData);
				augFlight = baiscComposition != composition;

				if (mode == "DUTY" && firstFlyStart == 0) {
					firstFlyStart = segment->getStartTimeUtcAct() + calcOffsetMinutes * 60;
				}
				if (!IsFlightCountedForMandayBlh(_dbData.get(), segment)) {
					continue;
				}
				if (mode == "FLIGHT") {
					const auto & date = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getStartTimeUtcAct(), calcOffsetMinutes);
					if (mResults.find(date) != mResults.end()) {
						mResults[date]->blh += segment->getBlkSeconds() / 60 * dbAssignment->BT_PCT;
						mResults[date]->ft += segment->getBlkSeconds() / 60 * dbAssignment->FT_PCT;
					}
					else {
						SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
						manday->idCrew = this->_crew->idCrew;
						manday->dateLoc = date;
						manday->crewDateUtc = date;
						manday->blh = segment->getBlkSeconds() / 60 * dbAssignment->BT_PCT;
						manday->ft = segment->getBlkSeconds() / 60 * dbAssignment->FT_PCT;
						mResults.insert(std::make_pair(date, manday));
					}
				} else {
					blk += (long)(segment->getBlkSeconds() * dbAssignment->BT_PCT);
					ft += (long)(segment->getBlkSeconds() * dbAssignment->FT_PCT);
				}
			}
			if (mode == "DUTY" && firstFlyStart != 0) {
				const auto& date = Utility::GetInstancePtr()->getLocalDayStartInUTC(firstFlyStart, 0);
				if (mResults.find(date) != mResults.end()) {
					mResults[date]->blh += blk / 60;
					mResults[date]->ft += ft / 60;
				}
				else {
					SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
					manday->idCrew = this->_crew->idCrew;
					manday->dateLoc = date;
					manday->crewDateUtc = date;
					manday->blh = blk / 60;
					manday->ft = ft / 60;
					mResults.insert(std::make_pair(date, manday));
				}
				firstFlyStart = 0;
 			}
		}
	}


}

void BasicCalculation::calculateAugAndIntBlh(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	const auto& mode = _dbData->getSystemParamValue("SPLIT_MANDAY_MODE");

	const auto& timezone = _dbData->getSystemParamValue("CREW_MANDAY_STORE_TIMEZONE");

	const auto& baiscComposition = _dbData->getSystemParamValue("BASIC_COMPOSITION_NAME");

	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	//string divide = this->_dbData->systemParamMap["DIVIDE_CREW_MANDAY"];

	int calcOffsetMinutes = 0;
	string zoneId = "";
	if (timezone == "CREW_BASE") {
		zoneId = this->_dbData->airportZoneIdMap[base];
		calcOffsetMinutes = crewBaseOffsetMinutes;
	}

	double setValues = 0;
	for (const auto& roster : rosters) {
		if (!roster->pairing)
			continue;

		const auto& duties = roster->pairing->getDutyVec();
		time_t firstFlyStart = 0;
		for (const auto& duty : duties) {
			long intBlh = 0;
			long augBlh = 0;
			const auto& segments = duty->getSegmentsRead();
			for (const auto& segment : segments) {
				auto iterAssignment = _dbData->assignmentNameMap.find(segment->getAssignment());
				if (iterAssignment == _dbData->assignmentNameMap.end()) {
					continue;
				}
				const auto& dbAssignment = iterAssignment->second;

				if (!dbAssignment)
					continue;

				bool augFlight = true;
				string composition = SegmentUtils::GetCompositionBySegmentFor3(segment, this->_dbData);
				augFlight = baiscComposition != composition;

				if (mode == "DUTY" && firstFlyStart == 0) {
					firstFlyStart = segment->getStartTimeUtcAct() + calcOffsetMinutes * 60;
				}
				bool intFlight = false;
				if (segment->getDomIntType() != "D")
					intFlight = true;
				if (mode == "FLIGHT") {
					const auto& date = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getStartTimeUtcAct(), calcOffsetMinutes);
					if (mResults.find(date) != mResults.end()) {
						if (intFlight)
							mResults[date]->intBlh += segment->getBlkSeconds() / 60 * dbAssignment->BT_PCT;
						if (augFlight)
							mResults[date]->augBlh += segment->getBlkSeconds() / 60 * dbAssignment->BT_PCT;
					}
					else {
						SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
						manday->idCrew = this->_crew->idCrew;
						manday->dateLoc = date;
						manday->crewDateUtc = date;
						if (intFlight)
							manday->intBlh = segment->getBlkSeconds() / 60 * dbAssignment->BT_PCT;
						if (augFlight)
							manday->augBlh = segment->getBlkSeconds() / 60 * dbAssignment->BT_PCT;
						mResults.insert(std::make_pair(date, manday));
					}
				}
				else if (mode == "DUTY") {
					if (intFlight)
						intBlh += (long)(segment->getBlkSeconds() * dbAssignment->BT_PCT);
					if (augFlight)
						augBlh += (long)(segment->getBlkSeconds() * dbAssignment->BT_PCT);
				}
				else {
					const auto& offsetMin = TimezoneUtils::GetTimezoneOffset(segment->getStartTimeUtcAct(), zoneId);
					const auto& localStartDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getStartTimeUtcAct(), offsetMin);
					const auto& localEndDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getEndTimeUtcAct(), offsetMin);
					// 增加保护，只计算一年内的manday
					//iDaysBetween = min((int)((localEndDay - localStartDay) / (24 * 3600) + 1), 365);
					//计算采用左闭右开[1730592000,1730678400) 、[2024/11/3 0:00:00, 2024/11/4 0:00:00)  2024/11/4为0分钟，因此不计入。iDaysBetween=1天
					time_t localStartTime = segment->getStartTimeUtcAct() + offsetMin * 60;//本地时区开始时间
					time_t localEndTime = segment->getEndTimeUtcAct() + offsetMin * 60;//本地时区结束时间
					int iDaysBetween = min((int)((localEndTime - 1) / (24 * 60 * 60) - localStartTime / (24 * 60 * 60) + 1), 365);
					int iPhTaken = 0;
					
					for (int i = 0; i < iDaysBetween; ++i)
					{
						const auto& currentDayStartInUtc = (time_t)(localStartDayInUtc + i * 24 * 3600 + offsetMin * 60);
						auto manday = mResults.find(currentDayStartInUtc);
						if (manday == mResults.end())
							continue;

						time_t minEnd = min(currentDayStartInUtc + 24 * 3600, segment->getEndTimeUtcAct() + offsetMin * 60);
						time_t maxStart = max(currentDayStartInUtc, segment->getStartTimeUtcAct() + offsetMin * 60);

						if (minEnd > maxStart) {
							//20190221 ain, mantis#4970, BH adj只对 BH/PH/WP生效, BH/PH分支单独处理
							setValues = ((minEnd - maxStart) * dbAssignment->BT_PCT) / 60.0;
						}
						if (intFlight)
							manday->second->intBlh += setValues;
						if (augFlight)
							manday->second->augBlh += setValues;
					}
				}
			}
			if (mode == "DUTY" && firstFlyStart != 0) {
				const auto& date = Utility::GetInstancePtr()->getLocalDayStartInUTC(firstFlyStart, 0);
				if (mResults.find(date) != mResults.end()) {
					mResults[date]->intBlh += intBlh / 60;
					mResults[date]->augBlh += augBlh / 60;
				}
				else {
					SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
					manday->idCrew = this->_crew->idCrew;
					manday->dateLoc = date;
					manday->crewDateUtc = date;
					manday->intBlh = intBlh / 60;
					manday->augBlh = augBlh / 60;
					mResults.insert(std::make_pair(date, manday));
				}
			}
		}
	}
}


void BasicCalculation::calculateBLHByDictionary(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	if (this->_dbData->dictionaryMap.find("FT_PCT_BY_ACTING_RANK") == this->_dbData->dictionaryMap.end())
		return;

	string base = (this->_crew != nullptr) ? this->_crew->getPrimeBase() : this->_roster->location;
	string idCrew = (this->_crew != nullptr) ? this->_crew->idCrew : this->_roster->idcrew;

	auto crewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	string timezone = this->_dbData->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"];
	int calcOffsetMinutes = 0;
	string zoneId = "";
	if (timezone == "CREW_BASE" || timezone == "UTC2") {
		zoneId = this->_dbData->airportZoneIdMap[base];
		calcOffsetMinutes = crewBaseOffsetMinutes;
	}
	else if (timezone != "UTC") {
		zoneId = this->_dbData->airportZoneIdMap[timezone];
		calcOffsetMinutes = this->_dbData->getAirportOffsetMinutes(timezone);
	}
	// 默认base时区
	else {
		zoneId = this->_dbData->airportZoneIdMap[base];
	}
	const auto& dictionList = this->_dbData->dictionaryMap["FT_PCT_BY_ACTING_RANK"];
	double setValues;
	for (const auto& roster : rosters) {
		for (const auto& dic : dictionList) {
			if (roster->actingRank == dic->code) {
				double percentage = 0.0;
				if (isNumberStr(dic->name.c_str(), dic->name.length()))
					percentage = stod(dic->name);
				else
					percentage = 0;
				if (roster->pairing) {
					const auto& pairing = roster->pairing;
					for (const auto& duty : pairing->getDutyVec()) {
						for (const auto& segment : duty->getSegmentsRead()) {
							if (!IsFlightCountedForMandayBlh(_dbData.get(), segment)) {
								continue;
							}
							calcOffsetMinutes = TimezoneUtils::GetTimezoneOffset(segment->getStartTimeUtcAct(), zoneId);
							const auto & localStartDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getStartTimeUtcAct(), calcOffsetMinutes);
							const auto& localEndDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getEndTimeUtcAct(), calcOffsetMinutes);
							// 增加保护，只计算一年内的manday
							//iDaysBetween = min((int)((localEndDay - localStartDay) / (24 * 3600) + 1), 365);
							//计算采用左闭右开[1730592000,1730678400) 、[2024/11/3 0:00:00, 2024/11/4 0:00:00)  2024/11/4为0分钟，因此不计入。iDaysBetween=1天
							time_t localStartTime = segment->getStartTimeUtcAct() + calcOffsetMinutes * 60;//本地时区开始时间
							time_t localEndTime = segment->getEndTimeUtcAct() + calcOffsetMinutes * 60;//本地时区结束时间
							int iDaysBetween = min((int)((localEndTime - 1) / (24 * 60 * 60) - localStartTime / (24 * 60 * 60) + 1), 365);
							int iPhTaken = 0;
							time_t currentDayStartInUtc = 0;
							for (int i = 0; i < iDaysBetween; ++i)
							{
								const auto& manday = mResults.find(currentDayStartInUtc + calcOffsetMinutes * 60);
								if (manday == mResults.end())
									continue;
								currentDayStartInUtc = localStartDayInUtc + i * 24 * 3600;


								time_t minEnd = min(currentDayStartInUtc + 24 * 3600, segment->getEndTimeUtcAct());
								time_t maxStart = max(currentDayStartInUtc, segment->getStartTimeUtcAct());

								if (minEnd > maxStart) {
									//20190221 ain, mantis#4970, BH adj只对 BH/PH/WP生效, BH/PH分支单独处理
									setValues = ((minEnd - maxStart) * percentage) / 60.0;
								}
								manday->second->blh = setValues;
							}
						}
					}
				}
			}
		}
	}
	
}

void BasicCalculation::calculateCrossTZDutyCount(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {
	if (rosters.empty())
		return;

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	string strRequiredMaxTZDiff = this->_dbData->getSystemParamValue("MANDAY_MAX_CROSS_TZ_DUTY", "360");
	int requiredMaxTZDiff = atoi(strRequiredMaxTZDiff.c_str());//最大时差6小时（360分钟）

	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);

	for (const auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}

		for (auto& duty : roster->pairing->getDutyVec()) {
			if (duty->getFDPInSecs() <= 0) {
				continue;
			}

			string baseZoneId = _dbData->getAirportZoneId(duty->getDepStationRead());
			time_t baseStartUtc = duty->getFirstSegment()->getStartTimeUtcAct();

			int maxTZDiff = 0;
			for (auto& segment : duty->getSegmentsRead()) {
				string depZoneId = _dbData->getAirportZoneId(segment->getDepStationRead());
				int tzDiff = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(baseStartUtc, baseZoneId, segment->getStartTimeUtcAct(), depZoneId));
				if (tzDiff > maxTZDiff) {
					maxTZDiff = tzDiff;
				}

				string arrZoneId = _dbData->getAirportZoneId(segment->getArrStationRead());
				tzDiff = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(baseStartUtc, baseZoneId, segment->getEndTimeUtcAct(), arrZoneId));
				if (tzDiff > maxTZDiff) {
					maxTZDiff = tzDiff;
				}
			}

			if (maxTZDiff >= requiredMaxTZDiff) {
				const auto& date = Utility::GetInstancePtr()->getLocalDayStartInUTC(duty->getStartTimeUtcAct(), offsetTZMinutes) + offsetTZMinutes * 60;
				auto iterManday = mResults.find(date);
				if (iterManday == mResults.end()) {
					SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
					manday->idCrew = crew->idCrew;
					manday->dateLoc = date;
					manday->crewDateUtc = date - offsetTZMinutes * 60;
					manday->crossTzDutyCount = 1;
					mResults.insert(std::make_pair(date, manday));
				}
				else {
					iterManday->second->crossTzDutyCount++;
				}
			}
		}
	}
}

void BasicCalculation::calculateMandayDDO(map<time_t, SharedPtr<CREW_MANDAY_BASIC>>& mResults, vector<SharedPtr<ROSTER>>& rosters, bool setCalculated) {

	
	if (rosters.empty())
		return;

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}

	auto dayOffDefinitionRules = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);
	if (dayOffDefinitionRules.empty()) {
		return;
	}
	AnrDayOffDefinition dayOffDefinition;
	dayOffDefinition.loadFromDbRules(dayOffDefinitionRules);

	std::shared_ptr<CREW> crew = iterCrew->second;
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), iterCrew->second, this->_dbData);


	//实际分配DDO的时间段,<开始时间(本地时区),结束时间(本地时区),是否第一个由适应状态到未适应状态，并且时区差6小时的DDO>
	vector<std::tuple<time_t, time_t, bool>> actDaysOffsInManday;

	auto& dayOffDefineEx = dayOffDefinition.getReqExRow();
	bool isCountBlankDay = dayOffDefineEx.isBlankDayCountedDO;
	
	vector<std::tuple<time_t, time_t>> daysOffsOfAssignment;//连续分配DDO的时间段(可能包含空白天)
	time_t firstDaysOffStartTimeUtc = -1, lastDaysOffEndTimeUtc = -1; //第一个DO开始时间,最后一个DO结束时间
	time_t restStartTimeUtc = -1, restEndTimeUtc = -1;//包含Rest和DO Extension Assignment的休息时间
	SharedPtr<ROSTER> prevRoster = nullptr;
	SharedPtr<ROSTER> prevWorkRoster = nullptr;

	for (size_t i = 0; i <= rosters.size(); i++) {
		SharedPtr<ROSTER> currRoster = i >= rosters.size() ? nullptr : rosters[i];
		SharedPtr<ROSTER> nextRoster = (i + 1) >= rosters.size() ? nullptr : rosters[i + 1];

		if (restStartTimeUtc == -1) {
			if (prevRoster == nullptr) {
				restStartTimeUtc = _dbData->scenario.startDtUTC;
			}
			else {
				restStartTimeUtc = dayOffDefineEx.isDoExtensionAssignment(prevRoster->qualifier, this->_dbData) ? prevRoster->getStartTimeUtcAct() : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
				restStartTimeUtc = std::max(restStartTimeUtc, _dbData->scenario.startDtUTC - DO_FORWARD_EXT_DURATION);//restStartTimeUtc最多向前延伸1天
			}
		}

		if (isCountBlankDay) {
			//获得二者之间的空白天数
			time_t prevRestStartTimeUtc = prevRoster == nullptr ? _dbData->scenario.startDtUTC : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
			prevRestStartTimeUtc = std::max(prevRestStartTimeUtc, _dbData->scenario.startDtUTC);//DDO本体必须在周期内
			//prevRestStartTimeUtc = std::min(prevRestStartTimeUtc, restStartTimeUtc);
			//当currRoster == nullptr 则后续没有任务，结束时间为scenario结束时间
			time_t checkRestEndTimeUtc = currRoster == nullptr ? _dbData->scenario.endDtUTC : currRoster->getStartTimeUtcAct();
			if (currRoster != nullptr && currRoster->getStartTimeUtcAct() > _dbData->scenario.endDtUTC) {
				checkRestEndTimeUtc = std::min(currRoster->getStartTimeUtcAct(), _dbData->scenario.endDtUTC);
			}
			auto blankDays = TimeUtils::GetFullDaysBetweenTimes(prevRestStartTimeUtc, checkRestEndTimeUtc, offsetTZMinutes);
			daysOffsOfAssignment.insert(daysOffsOfAssignment.end(), blankDays.begin(), blankDays.end());
		}

		if (currRoster == nullptr) {
			restEndTimeUtc = _dbData->scenario.endDtUTC; //后续没有任务，结束时间为scenario结束时间
		}
		else if (currRoster->getStartTimeUtcAct() < _dbData->scenario.endDtUTC && dayOffDefineEx.isDoAssignment(currRoster->qualifier, this->_dbData)) {
			if (firstDaysOffStartTimeUtc < 0) {
				firstDaysOffStartTimeUtc = currRoster->getStartTimeUtcAct();
			}
			lastDaysOffEndTimeUtc = currRoster->getEndTimeUtcAct();
			daysOffsOfAssignment.emplace_back(currRoster->getStartTimeUtcAct(), currRoster->getEndTimeUtcAct());
		}
		else if (dayOffDefineEx.isDoExtensionAssignment(currRoster->qualifier, this->_dbData)) {
			restEndTimeUtc = currRoster->getRestStartUtcAct() + GetEndTimeGapInSec(currRoster);
		}
		else {
			restEndTimeUtc = std::min(currRoster->getStartTimeUtcAct(), _dbData->scenario.endDtUTC);
		}

		//下一个Roster不存在或超过检查范围，设置restEndTimeUtc
		if (restEndTimeUtc < 0) {
			if (nextRoster == nullptr || nextRoster->getStartTimeUtcAct() > _dbData->scenario.endDtUTC) {
				restEndTimeUtc = _dbData->scenario.endDtUTC;
				//nextRoster是休息，则最后一天休息可以向后延申
				if (nextRoster != nullptr && RuleParams::GetInstancePtr()->isRestAssignment(nextRoster->qualifier, nextRoster->duty)) {
					restEndTimeUtc = std::max(restEndTimeUtc, nextRoster->getEndTimeUtcAct());
				}
			}
		}

		if (restEndTimeUtc > restStartTimeUtc) {
			if (!isCountBlankDay) {
				//空白天不能作为DO，此时restStartTimeUtc、restEndTimeUtc最多向前和向后延伸1天
				restStartTimeUtc = std::max(firstDaysOffStartTimeUtc - DO_FORWARD_EXT_DURATION, restStartTimeUtc);
				//restEndTimeUtc = std::min(lastDaysOffEndTimeUtc + 60 + DO_BACKWARD_EXT_DURATION, restEndTimeUtc);//DO结束实际23:59，因此需要增加60秒
				restEndTimeUtc = std::max(lastDaysOffEndTimeUtc + 60 + DO_BACKWARD_EXT_DURATION, restEndTimeUtc);//DO结束实际23:59，因此需要增加60秒
			}

			bool isFirstRecy6OffsetDDO = isFirstRecently6OffsetDDO(prevWorkRoster, currRoster, _dbData);
			//累计[restStartTimeUtc,restEndTimeUtc]之间的满足DDO定义的时间段
			auto daysOffOfDefineInRest = dayOffDefinition.getDaysOffInRest(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes);

			//daysOffInRestOfDefine和dayOffs交集的时间段，添加到actDaysOff中
			bool firstDdo = true;
			for (auto& daysOffOfDefine : daysOffOfDefineInRest) {
				auto ddoDefineStartLoc = std::get<0>(daysOffOfDefine)+ (time_t)offsetTZMinutes * 60;
				auto ddoDefineEndLoc = std::get<1>(daysOffOfDefine)+ (time_t)offsetTZMinutes * 60;
				for(auto& dayOffOfAssignment : daysOffsOfAssignment) {
					auto ddoAssignmentStartLoc = std::get<0>(dayOffOfAssignment) + (time_t)offsetTZMinutes * 60;
					auto ddoAssignmentEndLoc = std::get<1>(dayOffOfAssignment) + (time_t)offsetTZMinutes * 60;
					//计算分配DDO Assignment(可能包括空白天)时间段[ddoAssignmentStartLoc,ddoAssignmentEndLoc]与DDO定义时间段[ddoDefineStartLoc,ddoDefineEndLoc]重叠时长
					time_t overlapDuration = std::min(ddoAssignmentEndLoc, ddoDefineEndLoc) - std::max(ddoAssignmentStartLoc, ddoDefineStartLoc);
					if (overlapDuration >= 12 * 60 * 60) {//重叠时长大于等于12小时
						actDaysOffsInManday.emplace_back(ddoDefineStartLoc, ddoDefineEndLoc, firstDdo ? isFirstRecy6OffsetDDO : false);
						if (firstDdo) {
							firstDdo = false;
						}
						break;
					}

					// //判断分配DDO Assignment(可能包括空白天)时间段[ddoAssignmentStartLoc,ddoAssignmentEndLoc]需要在DDO定义时间段[ddoDefineStartLoc,ddoDefineEndLoc]内	
					// if (ddoAssignmentStartLoc >= ddoDefineStartLoc && ddoAssignmentEndLoc <= ddoDefineEndLoc) {
					// 	actDaysOffsInManday.emplace_back(ddoAssignmentStartLoc, ddoAssignmentEndLoc, isRecy6OffsetDDO);
					// 	break;
					// }
				}
				
			}
		}

		if (restEndTimeUtc >= 0) {
			daysOffsOfAssignment.clear();
			restStartTimeUtc = -1;
			restEndTimeUtc = -1;
			firstDaysOffStartTimeUtc = -1;
			lastDaysOffEndTimeUtc = -1;
		}
		
		prevRoster = currRoster;
		if (currRoster != nullptr && dayOffDefineEx.isWorkAssignment(currRoster->qualifier, this->_dbData) && currRoster->pairing != nullptr	) {
			prevWorkRoster = currRoster;
		}
		
	}

	//清空DDO
	for (auto& result : mResults) {
		result.second->isDomesticDo = DAY_OFF_NA;
		result.second->isFirstRecy6Offsetddo = false;
	}

	//actDaysOffs添加到manday
	for (auto& actOffInManday : actDaysOffsInManday	) {
		auto startLoc = std::get<0>(actOffInManday);
		auto endLoc = std::get<1>(actOffInManday);

		time_t ddoDate = dayOffDefinition.getDaysOffDate(startLoc, endLoc);

		auto isRecy6OffsetDDO = std::get<2>(actOffInManday);

		auto iterManday = mResults.find(ddoDate);
		if (iterManday == mResults.end()) {
			SharedPtr<CREW_MANDAY_BASIC> manday = std::make_shared<CREW_MANDAY_BASIC>();
			manday->idCrew = crew->idCrew;
			manday->dateLoc = ddoDate;
			manday->crewDateUtc = ddoDate - offsetTZMinutes * 60;
			manday->isDomesticDo = DAY_OFF_EXIST;
			manday->isFirstRecy6Offsetddo = isRecy6OffsetDDO;
			mResults.insert(std::make_pair(ddoDate, manday));
		}
		else {
			iterManday->second->isDomesticDo = DAY_OFF_EXIST;
			iterManday->second->isFirstRecy6Offsetddo = isRecy6OffsetDDO;
		}		
	}
}

/*
需求：
1）当RO分配一个PAIRING给一个CREW时，这个新增ASSIGNMENT，需要反映到CREW CONTEXT类下ROSTER列表里。
也就是需要根据上述ASSIGNMENT信息，新构造一个ROSTER类，并放入到相应CREW下。拉下ROSTER时同理。
2）当ROSTER发生变化时（ADD/DELETE),相应统计数据MANDAY等也需重新计算。下述函数将会用到这个场景里。
调用者传入需要修改的ROSTER，函数calculateManDay会根据法规重新计算MANDAY数据。
使用场景有两个：
(1) 增加ROSTER，需要在原先MANDAY数据上，增加新计算的结果。
(2) 拉下ROSTER，需要扣除新的MANDAY.
计算基准为CREW BASE

*/

vector<SharedPtr<CREW_MANDAY_BASIC>> BasicCalculation::calculateManDay()
{

	DBG_HELP("BasicCalculation::calculateManDay");
	vector<SharedPtr<CREW_MANDAY_BASIC>>  result;

	string dbg = "";
	if (!(this->_roster))
	{
		return result;
	}
	vector<SharedPtr<ROSTER>> rosters;
	rosters.push_back(_roster);

	map<time_t, SharedPtr<CREW_MANDAY_BASIC>> basics = calculateManDays(rosters, false);

	for (auto& mday : basics)
	{
		result.push_back(mday.second);
	}


	/*
	bool hasException = false;
	string exceptionMsg;

	try
	{
	bool isDebug = false;
	time_t start = this->_roster->actStrUtc;
	time_t end = this->_roster->actRestStrUtc;
	int iFDPMode = RuleParams::GetInstancePtr()->GetFDPMode();
	string base;
	if (this->_crew)
	base=this->_crew->getPrimeBase();
	string rosterType = this->_roster->duty;
	string crewID = this->_roster->idcrew;
	//mantis#1049, 统一manday统计时区为 crew base时区
	int crewBaseTimezoneOffset = 0;
	if (this->_roster->idcrew == "NULL") {
	dbg = "getAirportOffset";
	crewBaseTimezoneOffset = this->_dbData->getAirportOffset(this->_roster->location);
	}
	else {
	dbg = "crewBaseTimezoneOffsetIndex.getHourOffset";
	crewBaseTimezoneOffset = this->_dbData->crewIdMap[this->_roster->idcrew]->crewBaseTimezoneOffsetIndex->getHourOffset(start);
	}

	//mantis#1202, 按roster->pairing是否存在决定如何统计roster manday
	//计算非FLY任务
	//比实际时间长度多算1天，以针对没有日历对齐情况
	dbg = "DaysBetween";
	time_t localStartDay = 0;
	time_t localEndDay = 0;
	//mantis#2121, 无crew时按roster.location切manday
	int defaultOffset = this->_dbData->getAirportOffset(_roster->location);
	if (! _crew) {
	localStartDay = getStartTimeOfDay(start + defaultOffset * 3600);
	localEndDay = getStartTimeOfDay(end + defaultOffset * 3600);
	}
	else {
	localStartDay = this->_crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(start);
	localEndDay = this->_crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(end);
	}
	int iDaysBetween = (localEndDay - localStartDay) / (24 * 3600) + 1;

	bool isHalf = Utility::GetInstancePtr()->isHalfRoster(_roster);
	bool isInSameCity = false;
	bool bFoundAnotherHalf = false;
	bool bSouthNorath = false;
	int iPerDiem = 0;
	if (_crew)
	{

	bSouthNorath = Utility::GetInstancePtr()->isSouthNorathCommute(_crew, base, _roster);
	isInSameCity = Utility::GetInstancePtr()->isInSameCity(this->_roster->location , base);
	if (bSouthNorath && isHalf)
	{

	}
	else
	{
	if (isInSameCity && !isHalf)
	{
	if ((this->_roster->pairing))
	iPerDiem = this->_roster->pairing->getPerDiemMin() + this->_roster->pairing->getPerDiemAdjMin();
	}
	else if (!isInSameCity && isHalf)
	{
	int iPrevHalf = -1;
	vector<SharedPtr<ROSTER>>& rosters = _crew->rosterList;
	for (int iIndex = 0; iIndex < (int)rosters.size() - 1; ++iIndex)
	{
	if (rosters[iIndex]->rosterId == _roster->rosterId || rosters[iIndex]->actStrUtc>_roster->actStrUtc)
	break;
	if (Utility::GetInstancePtr()->isHalfRoster(rosters[iIndex]))
	iPrevHalf = iIndex;
	}

	if (iPrevHalf >= 0 && (Utility::GetInstancePtr()->isInSameCity(rosters[iPrevHalf]->location, base)))
	{
	start = rosters[iPrevHalf]->actStrUtc;
	end = _roster->restStrUtc;
	iDaysBetween = Utility::GetInstancePtr()->DaysBetween(start, end, crewBaseTimezoneOffset) + 1;
	bFoundAnotherHalf = true;
	}
	}
	}
	}

	//mantis#2121, 无crew时按roster.location切manday
	//计算 local day划分, 指定 _crew则按 crew_base时区计算, 否则按 defaultOffset时区
	vector<pair<time_t, time_t>> days;
	if (_crew) {
	_crew->crewBaseTimezoneOffsetIndex->computeLocalDayListInUtc(start, end, days);
	}
	else {
	time_t utcStartDay = localStartDay - defaultOffset * 3600;
	time_t utcEndDay = localEndDay - defaultOffset * 3600;
	for (time_t t = utcStartDay; t <= utcEndDay; t += 24 * 3600) {
	days.push_back(make_pair(t, t + 24 * 3600 - 1));
	}
	}

	//mantis#1665, 判断是否地面任务增加 roster->duty判断
	if (this->_roster->pairId == 0
	|| this->_dbData->isAssignmentInGroup(_roster->duty, "DO")
	|| this->_dbData->isAssignmentInGroup(_roster->duty, "SBY")
	|| this->_dbData->isAssignmentInGroup(_roster->duty, "LEA")
	|| this->_dbData->isAssignmentInGroup(_roster->duty, "GND"))
	{
	dbg = "none-FLY";
	for (auto& day : days) {
	time_t DayStart = day.first;
	time_t DayEnd = day.second;
	if (start < DayEnd && end > DayStart)
	{
	SharedPtr<CREW_MANDAY_BASIC> temp(new CREW_MANDAY_BASIC(crewID, DayStart));
	calOneDayDoSbyLeaGnd(_dbData, temp, _roster->duty, _roster->qualifier);//计算 DO/SBY/LEA/GND ....
	calOneDayDpForNoneFly(_dbData, temp, _roster, DayStart, DayEnd);
	//mantis#2320, 忽略空manday item
	if (!temp->isEmpty()) {
	result.push_back(temp);
	}
	}
	}
	}
	else
	{
	//计算FLY任务: 从 pairing统计 manday
	dbg = "FLY";
	if (!(this->_roster->pairing)){
	return result;
	}
	for (auto& day : days) {
	time_t DayStart = day.first;
	time_t DayEnd = day.second;
	SharedPtr<CREW_MANDAY_BASIC> temp(new CREW_MANDAY_BASIC(crewID, DayStart));
	calOneDayDpFdpFtForFly(_dbData, temp, _roster, DayStart, DayEnd, isDebug, iFDPMode);
	calOneDayDoSbyLeaGnd(_dbData, temp, _roster->duty, _roster->qualifier);//计算 DO/SBY/LEA/GND ....
	calOneDayPerdiem(_crew, temp, _roster, _pairing, DayStart, DayEnd, iPerDiem, isInSameCity, isHalf, bFoundAnotherHalf);
	//mantis#2320, 忽略空manday item
	if (!temp->isEmpty()) {
	result.push_back(temp);
	}
	}
	}

	//根据业务规则修正结果
	calListKeepStartSbyOnly(_dbData, result);//20180130 ain, OP#1583, 修正是否只保留首日 SBY
	}
	catch (char* ex) {
	cout << "Exception: in calculateManDay(), " << ex << ", dbg=" << dbg << " pairing=" << _roster->pairId << " crew=" << _roster->idcrew << " utc=" << utcToUtcString(_roster->strUtc) << utcToUtcString(_roster->endUtc) << endl;
	hasException = true; exceptionMsg = ex;
	}
	catch (string& ex) {
	cout << "Exception: in calculateManDay(), " << ex << ", dbg=" << dbg << " pairing=" << _roster->pairId << " crew=" << _roster->idcrew << " utc=" << utcToUtcString(_roster->strUtc) << utcToUtcString(_roster->endUtc) << endl;
	hasException = true; exceptionMsg = ex;
	}
	catch (std::exception& ex) {
	cout << "Exception: in calculateManDay(), ex=" << ex.what() << " dbg=" << dbg << " pairing=" << _roster->pairId << " crew=" << _roster->idcrew << " utc=" << utcToUtcString(_roster->strUtc) << utcToUtcString(_roster->endUtc) << endl;
	hasException = true; exceptionMsg = ex.what();
	}
	catch (...) {
	cout << "Exception: in calculateManDay(), dbg=" << dbg << " pairing=" << _roster->pairId << " crew=" << _roster->idcrew << " utc=" << utcToUtcString(_roster->strUtc) << utcToUtcString(_roster->endUtc) << endl;
	hasException = true; exceptionMsg = "generation exception";
	}

	if (hasException) {
	if (this->_crew.get()) {
	cout << "Dump for manday.basicCalculation.calculateManDay crew=" << _roster->idcrew << endl;
	for (auto& crewBase : _crew->baseList) {
	cout << "  CREW_BASE " << crewBase->base << " " << utcToUtcString(crewBase->effUtc) << " " << utcToUtcString(crewBase->expUtc) << endl;
	}
	if (_crew->crewBaseTimezoneOffsetIndex->getIndex().empty()) {
	cout << "  CRWE_BASE_INDEX empty\n";
	}
	for (auto& it : _crew->crewBaseTimezoneOffsetIndex->getIndex()) {
	cout << "  CRWE_BASE_INDEX " << utcToUtcString(it.first) << " offset=" << it.second << endl;
	}
	for (auto& roster : _crew->rosterList) {
	cout << "  ROSTER    " << roster->duty << " " << roster->actingRank << " " << utcToUtcString(roster->strUtc) << endl;
	}
	cout << "  THIS._roster crew=" << _roster->idcrew << " " << _roster->duty << " " << _roster->actingRank << " " << utcToUtcString(_roster->strUtc) << endl;
	}
	Logger::getRuleLogger()->error(exceptionMsg);
	return vector<SharedPtr<CREW_MANDAY_BASIC>>();
	}
	*/
	return result;
}

void BasicCalculation::calculate()
{
	stringstream ss;

	DBG_HELP("BasicCalculation::calculate");
	this->initialization();
	DBG_HELP3("calcualteSegmentBlock");
	this->calcualteSegmentBlock();
	DBG_HELP3("calcualteFDP");
	//this->calcualteFDP();
	DBG_HELP3("calcualteDP");
	//this->calcualteDP();
	DBG_HELP3("calcualteCredit");
	this->calcualteCredit();
	//this->calcualteRest();
	DBG_HELP3("calcualtePerDiem");
	this->calcualtePerDiem();
}

void BasicCalculation::initialization()
{

}

void BasicCalculation::calcualteRest()
{
	time_t start, end;
	long pickup, dropoff, brief, debrief;
	Pairing* pg = _pairing;
	if (pg)
	{
		int iSize = (int)pg->getNumDuties();
		for (int di = 0; di < iSize; di++)
		{
			start = 0, end = 0, pickup = 0, dropoff = 0, brief = 0, debrief = 0;
			Duty * duty = pg->getDuty(di);
			if (duty->getNumSegments() == 0) {
				continue;//20190119 ain, avoid null except
			}
			//if (duty->getPairingId() == 27051395)
			//	printf("");
			start = duty->getLastSegment()->getEndTimeUtcAct();
			debrief = duty->getActualDebriefMin();
			if (debrief <= 0)
				debrief = duty->getMinDebrief();
			dropoff = duty->getActualDropoffMin();
			if (dropoff <= 0)
				dropoff = duty->getMinDropoff();
			start = start + (debrief + dropoff) * 60;
			if (di >= iSize - 1)
			{
				end = pg->getEndTimeUtcAct();
			}
			else
			{
				Duty * next = pg->getDuty(di + 1);
				//20190723 ain, mantis#6286, 容忍ptn/duty为空
				end = next->getNumSegments() > 0 ? next->getFirstSegment()->getStartTimeUtcAct() : next->getStartTimeUtcAct();
				brief = next->getActualBriefMin();
				if (brief <= 0)
					brief = next->getMinBrief();
				pickup = next->getActualDropoffMin();
				if (pickup <= 0)
					pickup = next->getMinDropoff();
				end = end - (brief + pickup) * 60;
			}
			if (end > start)
				duty->setActualRest(static_cast<int>(end - start) / 60);

		}

	}
}


//void BasicCalculation::calcualteFT()
//{
//
//}

/*
void BasicCalculation::calcualteFDP()
{
	Pairing* pg = _pairing;
	if (calMode == 2)
	{
		pg = _roster->pairing;
	}
	else if (calMode == 1)
		pg = _pairing;
	else
		return;

	if (!pg)
		return;
	CalculationManday FDP = this->_dbData->calculationMandayMap["FDP"];
	for (std::size_t di = 0; di < pg->getNumDuties(); di++)
	{
		Duty * duty = pg->getDuty(di);
		duty->calculateFDP(0, FDP.str, FDP.end);
	}

}
*/

/*
void BasicCalculation::calcualteDP()
{
	if (!_pairing)
		return;
	CalculationManday DP = this->_dbData->calculationMandayMap["DP"];
	CalculationManday ACT_DP = this->_dbData->calculationMandayMap["ACT DP"];
	for (std::size_t di = 0; di < _pairing->getNumDuties(); di++)
	{
		Duty * duty = _pairing->getDuty(di);
		duty->calculateDP(0, DP.str, DP.end);
		duty->calculateDP(1, ACT_DP.str, ACT_DP.end);
	}
}
*/

void BasicCalculation::calcualteCredit()
{
	Pairing* pg = _pairing;
	if (calMode == 2)
	{
		pg = _roster->pairing;
	}
	else if (calMode == 1)
		pg = _pairing;
	else
		return;

	if (!pg)
		return;

	int offsetTZMinutes = DutyUtils::GetTimeZoneOffset(*pg->getFirstDuty(), _dbData);
	time_t firstMonthStartTimeUtcAct = pg->getFirstDuty()->getStartTimeUtcAct();//首月基于Pairing的开始时间为基准
	time_t firstMonthStartTimeUtcSch = SchDutyUtils::GetDutySchStartTimeUtc(pg->getFirstDuty());//首月基于Pairing的开始时间为基准
	for (auto& duty : pg->getDutyVec())
	{
		double dutyActCreditInSec = 0, dutyFmActCreditInSec = 0;
		double dutySchCreditInSec = 0, dutyFmSchCreditInSec = 0;
		for(auto& segment : duty->getSegments())
		{
			//首月基于Pairing的开始时间为基准
			auto [dutySegmentActCredit, dutySegmentFmActCredit] = getSegmentActCreditInSec(segment, firstMonthStartTimeUtcAct, offsetTZMinutes);
			auto [dutySegmentSchCredit, dutySegmentFmSchCredit] = getSegmentSchCreditInSec(segment, firstMonthStartTimeUtcSch, offsetTZMinutes);
			
			dutyActCreditInSec += dutySegmentActCredit;
			dutyFmActCreditInSec += dutySegmentFmActCredit;
			dutySchCreditInSec += dutySegmentSchCredit;
			dutyFmSchCreditInSec += dutySegmentFmSchCredit;

			//首月基于Segment的开始时间为基准
			auto [segmentActCredit, segmentFmActCredit] = getSegmentActCreditInSec(segment, segment->getStartTimeUtcAct(), offsetTZMinutes);
			auto [segmentSchCredit, segmentFmSchCredit] = getSegmentSchCreditInSec(segment, segment->getStartTimeUtcSch(), offsetTZMinutes);
			////首月基于Segment所在Pairing开始时间为基准
			//auto [segmentActCredit, segmentFmActCredit] = getSegmentActCreditInSec(segment, firstMonthStartTimeUtcAct, offsetTZMinutes);
			//auto [segmentSchCredit, segmentFmSchCredit] = getSegmentSchCreditInSec(segment, firstMonthStartTimeUtcSch, offsetTZMinutes);
			segment->setCreditInSec((int)segmentActCredit);
			segment->setFirstMonthCreditInSec((int)segmentFmActCredit);
			segment->setSchCreditInSec((int)segmentSchCredit);
			segment->setSchFirstMonthCreditInSec((int)segmentFmSchCredit);
		}
		duty->setCreditInSec((int)round(dutyActCreditInSec));
		duty->setSchCreditInSec((int)round(dutySchCreditInSec));
		duty->setFirstMonthCreditInSec((int)round(dutyFmActCreditInSec));
		duty->setSchFirstMonthCreditInSec((int)round(dutyFmSchCreditInSec));
	}
}

void BasicCalculation::calcualtePerDiem() {
	Pairing* pg = _pairing;
	if (calMode == 2)
	{
		pg = _roster->pairing;
	}
	else if (calMode == 1)
		pg = _pairing;
	else
		return;

	if (!pg)
		return;

	auto perDiem = _ruleEngine->getPairingPerDiemHourForEvaFd(pg);
	pg->setPerDiemInSec(perDiem.actPerDiemInSec);
	pg->setLongPerDiemInSec(perDiem.actLongPerDiemInSec);
	pg->setFirstMonthPerDiemInSec(perDiem.actFirstMonthPerDiemInSec);
	pg->setFirstMonthLongPerDiemInSec(perDiem.actFirstMonthLongPerDiemInSec);
	pg->setSchPerDiemInSec(perDiem.schPerDiemInSec);
	pg->setSchLongPerDiemInSec(perDiem.schLongPerDiemInSec);
	pg->setSchFirstMonthPerDiemInSec(perDiem.schFirstMonthPerDiemInSec);
	pg->setSchFirstMonthLongPerDiemInSec(perDiem.schFirstMonthLongPerDiemInSec);
}

int BasicCalculation::getInstructorMinutes(SharedPtr<CREW>& pCrew, vector<SharedPtr<CREW_TEAM>>& teams, vector<SharedPtr<ROSTER>>& rosters, long start, long end)
{
	int instructorMinutes = 0;

	return instructorMinutes;

}

void BasicCalculation::calcualteSegmentBlock()
{

	Pairing* pg = _pairing;
	if (calMode == 2)
	{
		pg = _roster->pairing;
	}
	else if (calMode == 1)
		pg = _pairing;
	else
		return;

	if (!pg)
		return;

	//map<int, SharedPtr<ASSIGNMENT>>& assignments = _dbData->totalAssignmentIdMap;
	//vector<Duty *> duties = pg->getDutyVec();
	//float factor;
	//for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
	for (std::size_t di = 0; di < pg->getNumDuties(); di++)
	{

		Duty * duty = pg->getDuty(di);
		//vector<Segment*> segments = (*duty)->getSegments();
		//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
		for (std::size_t si = 0; si < duty->getNumSegments(); si++)
		{

			Segment * segment = duty->getSegment(si);
			//mantis#1202, 利用 map<assignment, group>提升manday 效率, 避免每个segment循环 _dbData->totalAssignmentIdMap
			//for (map<int, SharedPtr<ASSIGNMENT>>::iterator it_assignment = assignments.begin(); it_assignment != assignments.end(); it_assignment++)
			{
				//SharedPtr<ASSIGNMENT> assignment = it_assignment->second;
				//if (assignment->AIRLINE == this->airlineCode && assignment->assignment == (*segment)->getAssignment())
				if (this->_dbData->assignmentNameMap.find(segment->getAssignment()) != _dbData->assignmentNameMap.end())
				{
					SharedPtr<ASSIGNMENT> assignment = _dbData->assignmentNameMap[segment->getAssignment()];
					if (assignment == NULL)
					{
						cout << "segment->getAssignment = " << segment->getAssignment() << endl;
						cout << "object assignment is NULL" << endl;
					}

					//if (isUseHistoryBlk)
					if (RuleParams::GetInstancePtr()->isUseHistoryBlock())
						segment->setHistoricalBlhFlag(true);
					//factor = assignment->BT_PCT;
					int blkTime = 0;
					int schBlkTime = 0;
					if (assignment == NULL) {
						//blkTime = (int)round((segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct()));
						schBlkTime = (int)round((segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch()));
					}
					else {
						//blkTime = (int)round((segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct())*(assignment->BT_PCT));
						schBlkTime = (int)round((segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch()) * (assignment->BT_PCT));
					}
					//segment->setBlkTime(blkTime);
					segment->setSchBlkTime(schBlkTime);
				}
			}
		}
		duty->calculateDutyBlockTime();
		duty->calculateDutySchBlockTime();
	}
}

SharedPtr<ASSIGNMENT> BasicCalculation::getAssignment(string strAssignment)
{
	SharedPtr<ASSIGNMENT> assignment;
	map<long long, SharedPtr<ASSIGNMENT>>& assignments = this->_dbData->totalAssignmentIdMap;
	for (map<long long, SharedPtr<ASSIGNMENT>>::iterator it_assignment = assignments.begin(); it_assignment != assignments.end(); ++it_assignment)
	{
		assignment = it_assignment->second;
		if ((this->_dbData->version == 3 || assignment->AIRLINE == this->airlineCode) && assignment->assignment == strAssignment)
		{
			break;
		}
	}
	return assignment;
}


static long BasicCalculationInstanceCount = 0;
int BasicCalculation::getInstanceCount() {
	return BasicCalculationInstanceCount;
}

void BasicCalculation::getAirlineCode()
{
	airlineCode = _dbData->scenario.airline;
}

void BasicCalculation::getHistoryFlag()
{
	for (size_t iRule = 0; iRule < _dbData->ruleList.size(); ++iRule)
	{
		//check every singel rule
		DBRule singleRule = _dbData->ruleList[iRule];
		//将来用函数指针取代switch case
		long long iPhase = singleRule.phase;

		if (singleRule.function == RULES::MAX_BLOCK_PERDUTY || singleRule.function == RULES::MAX_BLOCK_PERDUTY_R4)
		{
			auto& parameter = singleRule.params;

			map<string, string>::const_iterator iter;

			string header, headeValue;
			//1	COMPOSITION, RPT START, RPT END, MAX BLH
			//DEFINITION,VALUE
			//USEHISTORICALBLH,Y
			string strDefinition, strValue;
			for (iter = parameter.begin(); iter != parameter.end(); ++iter)
			{

				header = iter->first;
				headeValue = iter->second;

				if (header == "DEFINITION") {
					strDefinition = headeValue;
				}
				if (header == "VALUE") {
					strValue = headeValue;
				}
			}

			if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
			{
				isUseHistoryBlk = true;
			}

		}
	}

}


BasicCalculation::~BasicCalculation() {
	// InterlockedDecrement(&BasicCalculationInstanceCount);
	BasicCalculationInstanceCount--;
};
BasicCalculation::BasicCalculation(SharedPtr<CrewDataContext> data)
{
	// InterlockedIncrement(&BasicCalculationInstanceCount);
	BasicCalculationInstanceCount++;
	_dbData = data;
	//getHistoryFlag();
	getAirlineCode();
}

BasicCalculation::BasicCalculation(SharedPtr<CrewDataContext> data, SharedPtr<CREW> crew)
{
	// InterlockedIncrement(&BasicCalculationInstanceCount);
	BasicCalculationInstanceCount++;
	_dbData = data;
	//getHistoryFlag();
	getAirlineCode();
	_crew = crew;
}


BasicCalculation::BasicCalculation() {
	// InterlockedIncrement(&BasicCalculationInstanceCount);
	BasicCalculationInstanceCount++;
};

void BasicCalculation::setRuleEngine(LegalityChecker* ruleEngine) {
	_ruleEngine = ruleEngine;
}

void BasicCalculation::setCalculatedObject(Pairing* pairing)
{
	_pairing = pairing;
	calMode = 1;
}

void BasicCalculation::setCalculatedObject(SharedPtr<ROSTER> roster)
{
	_roster = roster;
	calMode = 2;
}

long BasicCalculation::getSBYInARange(vector<SharedPtr<ROSTER>>& rosters, time_t start, time_t end, vector<string>& sbyAssignments)
{
	time_t now = time(0);
	time_t nowDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(now, 0);
	long lReturn = 0;
	time_t rosterStart, rosterEnd;
	string rosterDuty;
	bool isAllPa = true;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		rosterStart = (*roster)->actStrUtc;
		rosterEnd = (*roster)->actRestStrUtc;
		if ((rosterEnd<start) || (rosterStart>end) || rosterStart < nowDay)
			continue;
		rosterDuty = (*roster)->duty;

		if (std::find(sbyAssignments.begin(), sbyAssignments.end(), rosterDuty) != sbyAssignments.end())
		{
			if (rosterStart < start)
				rosterStart = start;
			if (rosterEnd > end)
				rosterEnd = end;

			lReturn += static_cast<long>(rosterEnd - rosterStart);
		}
		if ((*roster)->source != "PA")
			isAllPa = false;
	}
	if (this->_ruleEngine->GetApplication() == ROSTER_OPTIMIZER && isAllPa)
		return 0;
	return (long)round(lReturn / 60.0);
}


//根据 Calculation_Manday定义获取start时间, 无定义按ACT
//item:  Pairing/Duty/Segment
//type:  BH/FT/FDP/DP
time_t BasicCalculation::getStartUtc(Activity* item, CALCULATION_TYPES& type) {
	string typeStr = "";
	switch (type) {
	case BH: typeStr = "BH"; break;
	case FT: typeStr = "FT"; break;
	case FDP:typeStr = "FDP"; break;
	case DP: typeStr = "DP"; break;
	default:
		break;
	}

	auto calculationManday = _dbData->getCalculationManday(typeStr);

	if (calculationManday.str.empty() || calculationManday.str == "ACT")
		return item->getStartTimeUtcAct();
	else
		return item->getStartTimeUtcSch();
}

//根据 Calculation_Manday定义获取end时间，无定义按ACT
//item:  Pairing/Duty/Segment
//type:  BH/FT/FDP/DP
time_t BasicCalculation::getEndUtc(Activity* item, CALCULATION_TYPES& type) {
	string typeStr = "";
	switch (type) {
	case BH: typeStr = "BH"; break;
	case FT: typeStr = "FT"; break;
	case FDP:typeStr = "FDP"; break;
	case DP: typeStr = "DP"; break;
	default:
		break;
	}

	auto calculationManday = _dbData->getCalculationManday(typeStr);

	if (calculationManday.str.empty() || calculationManday.str == "ACT")
		return item->getEndTimeUtcAct();
	else
		return item->getEndTimeUtcSch();

}

int BasicCalculation::getGuaranteeFlyingHour(const std::string& idCrew, const time_t localStartDay) const {
	int flyingHours = -1;
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[idCrew];
	if (crew != nullptr) {
		flyingHours = crew->getGuaranteeFlyingHour(localStartDay);
	}
	return flyingHours;
}

bool BasicCalculation::isCrewBaseTimezone(const int types) const {
	return types >= CALCULATION_TYPES::DO;
}

inline static double getSegmentFirstMonthCreditInSec(const time_t startTimeUtc, const time_t endTimeUtc, const double creditPct, const time_t firstMonthStartTimeUtc, const int offsetTZMinutes) {
	double segFirstMonthCreditInSec = 0;
	if (TimeUtils::IsSameMonth(startTimeUtc, firstMonthStartTimeUtc, offsetTZMinutes) && TimeUtils::IsSameMonth(startTimeUtc, endTimeUtc, offsetTZMinutes)) {
		//场景1: startTimeUtc和endTimeUtc在首月firstMonth
		segFirstMonthCreditInSec = static_cast<int>(endTimeUtc - startTimeUtc);
	}
	else if (TimeUtils::IsSameMonth(startTimeUtc, firstMonthStartTimeUtc, offsetTZMinutes) && !TimeUtils::IsSameMonth(startTimeUtc, endTimeUtc, offsetTZMinutes)) {
		//场景2: startTimeUtc在首月firstMonth，endTimeUtc在第二个月

		//"开始时间"和"结束时间"不在一个月，获得“结束时间”所在月份的第一个天0点（即所在月份开始时间）
		time_t monthStartInUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(endTimeUtc, offsetTZMinutes);
		segFirstMonthCreditInSec = static_cast<int>(monthStartInUtc - startTimeUtc);
	}
	return segFirstMonthCreditInSec * creditPct;
}

std::tuple<double, double> BasicCalculation::getSegmentActCreditInSec(const Segment* segment, const time_t firstMonthStartTimeUtcAct, const int offsetTZMinutes) {
	double creditPct = 1.0;
	auto iterAssignment = this->_dbData->assignmentNameMap.find(segment->getAssignment());
	if (iterAssignment != this->_dbData->assignmentNameMap.end()) {
		creditPct = iterAssignment->second->CREDIT_PCT;
	}
	
	int scheBlh = static_cast<int>(segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH")  - segment->getStartTimeUtcSch());
	int actBlh = static_cast<int>(segment->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "ACT") - segment->getStartTimeUtcAct());
	//credit默认使用计划时间进行计算，但是涉及到飞行、置位、本场训练等任务类型
	//如果发生flight delay（实际飞时大于计划飞时超过30分钟），则使用实际时间进行计算
	bool isDelay = ((actBlh - scheBlh) > 30 * 60);
	double segCreditInSec = (isDelay ? actBlh : scheBlh) * creditPct;

	//计算Segment首月Credit

	time_t startTimeUtc = segment->getStartTimeUtcSch();
	time_t endTimeUtc = segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH");
	if (isDelay) {
		startTimeUtc = segment->getStartTimeUtcAct();
		endTimeUtc = segment->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "ACT");
	}
	double segFirstMonthCreditInSec = getSegmentFirstMonthCreditInSec(startTimeUtc, endTimeUtc, creditPct, firstMonthStartTimeUtcAct, offsetTZMinutes);
	return std::make_tuple(segCreditInSec, segFirstMonthCreditInSec);
}


std::tuple<double, double> BasicCalculation::getSegmentSchCreditInSec(const Segment* segment, const time_t firstMonthStartTimeUtcSch, const int offsetTZMinutes) {
	double creditPct = 1.0;
	auto iterAssignment = this->_dbData->assignmentNameMap.find(segment->getAssignment());
	if (iterAssignment != this->_dbData->assignmentNameMap.end()) {
		creditPct = iterAssignment->second->CREDIT_PCT;
	}

	int scheBlh = static_cast<int>(segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH") - segment->getStartTimeUtcSch());
	//credit默认使用计划时间进行计算，但是涉及到飞行、置位、本场训练等任务类型
	double segCreditInSec = scheBlh * creditPct;

	//计算Segment首月Credit
	time_t startTimeUtc = segment->getStartTimeUtcSch();
	time_t endTimeUtc = segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH");
	double segFirstMonthCreditInSec = getSegmentFirstMonthCreditInSec(startTimeUtc, endTimeUtc, creditPct, firstMonthStartTimeUtcSch, offsetTZMinutes);

	return std::make_tuple(segCreditInSec, segFirstMonthCreditInSec);
}
