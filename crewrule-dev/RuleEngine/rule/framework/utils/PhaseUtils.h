#ifndef _PHASEUTILS_H_
#define _PHASEUTILS_H_

#include <vector>
#include "CrewDB.h"

using namespace std;

/**
	法规阶段工具类
*/
class PhaseUtils {
public:
	//用于Pairing的检查或Crew的Roster检查（飞行或地面Roster）
	static bool IsChecked(const Activity* activity, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData);
	static bool IsChecked(const Activity* activity, const long long rulePhase, const CrewDataContext* dbData);

	//用于Manday的检查
	static bool IsChecked(const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData);
	static bool IsChecked(const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const long long rulePhase, const CrewDataContext* dbData);

public:
	//从Roster列表(rosterList)中过滤出满足rulePhase条件的roster
	static vector<std::shared_ptr<ROSTER>> Filter(const vector<std::shared_ptr<ROSTER>>& rosterList, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData);
	static vector<std::shared_ptr<ROSTER>> Filter(const vector<std::shared_ptr<ROSTER>>& rosterList, const long long rulePhase, const CrewDataContext* dbData);

	//从Manday列表(mandayList)中过滤出满足rulePhase条件的manday
	static vector<std::shared_ptr<CREW_MANDAY_BASIC>> Filter(const vector<std::shared_ptr<CREW_MANDAY_BASIC>>& mandayList, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData);
	static vector<std::shared_ptr<CREW_MANDAY_BASIC>> Filter(const vector<std::shared_ptr<CREW_MANDAY_BASIC>>& mandayList, const long long rulePhase, const CrewDataContext* dbData);


};

#endif //_PHASEUTILS_H_