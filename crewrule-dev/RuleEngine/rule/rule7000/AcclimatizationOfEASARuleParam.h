/**
 * @file AcclimatizationOfEASARuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _AcclimatizationOfEASARulePARAM_H_
#define _AcclimatizationOfEASARulePARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationOfEASARule;



class AcclimatizationOfEASARuleParam : public RuleParam {
friend class AcclimatizationOfEASARule;
private:

	explicit AcclimatizationOfEASARuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7000;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		REF_TZ_START = 0,
		REF_TZ_END = 1,
		ETRTZ_START = 2,
		ETRTZ_END = 3,
		ACC_STATE = 4,
		SEVERITY = 5
	};

	//Reference TimeZone Start参考时差开始时间（分钟数）,格式：HH:mm
	std::string _refTZStart{};
	int _refTZStartMinutes{ 0 };

	//Reference TimeZone End参考时差开始时间（分钟数）,格式：HH:mm
	std::string _refTZEnd{};
	int _refTZEndMinutes{ 0 };

	//新地点适用开始时长（分钟数），ETRTZ （新地点适用时长）=当前Duty的签到时间-最近适应状态Duty的签到时间,格式：HH:mm
	std::string _ETRTZStart{};
	int _etrtzStartMinutes{ 0 };

	//新地点适用结束时长（分钟数）,格式：HH:mm
	std::string _ETRTZEnd{};
	int _etrtzEndMinutes{ 0 };

	//适用状态,取值：取值：B-适应状态（适应前一个Duty出发地的时区），D-适应状态（适应下一个Duty出发地时区，也就是本地即将执行任务所在地），	X - 未知状态。Pairing第一个Duty默认是D
	mutable std::string _acclimatizationState{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchTimeZoneDiffForRestStart(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	bool MatchAcclimatizationState(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	//匹配获得前一个Duty的休息开始时间适应状态
	bool MatchAcclimatizationStateForRestStart(const Duty& currDuty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;


};

#endif //_AcclimatizationOfEASARulePARAM_H_
