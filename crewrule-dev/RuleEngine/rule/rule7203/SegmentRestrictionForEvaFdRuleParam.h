/**
 * @file SegmentRestrictionForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _SEGMENTRESTRICTIONFOREVAFDRULEPARAM_H_
#define _SEGMENTRESTRICTIONFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckSegmentRestrictionForEvaFdRule;

class SegmentRestrictionForEvaFdRuleParam : public RuleParam {
friend class CheckSegmentRestrictionForEvaFdRule;
private:
    explicit SegmentRestrictionForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7203;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
		PAIRING_BASES = 1,
		COMPOSITIONS,
		DUTY_TYPE,
		CONSECUTIVE_DUTY,
		REPORT_TIME_RANGES,
		DP_ENCROACHING_PERIOD,
		ENCROACHING_DURATION,
		OVERRIDE_DUTY_ATTRIBUTES,
		SECTOR_BLH_RANGES,
		SEGMENT_ASSIGNMENTS,
		FLIGHT_FLEETS,
		MAX_SECTOR,
		DEP_ARPS,
		ARV_ARPS,
		SEVERITY
    };

	//任务环基地列表,支持*通配
	std::string _strPairingBases{};
	vector<std::string> _pairingBases{};

	//配比,多个值使用“|”分隔并支持*通配。格式：HH:mm
	vector<std::string> _compositions{};

	//Duty的国内国际类型,多个值使用“|”分隔并支持*通配。Duty的国内国际类型，取值：D-国内航班，I-国际航班，R-区域航班
	vector<std::string> _dutyTypes{};

	//Segment 任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	vector<string> _segmentAssignments{};

	//航班机型,支持 | 分开多个航班机型和 * 通配符。注：该参数只适用FLY航班，不适用DHD，也就是DHD的Fleet不参与判断
	vector<string> _flightFleets{};

	vector<string> _depArps{};

	vector<string> _arvArps{};

	//Duty报到时间(即签到时间)范围，为报到地的本地时间。支持*通配，格式：最小值(HH:mm)-最大值(HH:mm)
	std::string _reportTimeRange{};
	int _reportTimeRangeMinutesLower{};
	int _reportTimeRangeMinutesUpper{};

	//Duty Period侵入时间段，（从checkin到checkout结束）范围和该时间段有一分钟重叠，即视为满足条件。支持*通配，格式：最小值(HH:mm)-最大值(HH:mm)
	std::string _dpEncroachingPeriod{};
	int _dpEncroachingPeriodMinutesLower{};
	int _dpEncroachingPeriodMinutesUpper{};

	//Duty中航段飞行时间范围（分钟数）（满足Segment Assignments条件的Segment最大飞时）。支持*通配，格式：最小值(HH:mm)-最大值(HH:mm)
	std::string _segmentBlhRanges{};
	int _segmentBlhRangesMinutesLower{};
	int _segmentBlhRangesMinutesUpper{};

	//Duty最大航段数（满足Segment Assignments条件）
	int _maxSegmentNum{};

	//连续Duty数量，格式：n-m,支持*表示忽略，表示相同设定类型的duty有连续n到m个时
	std::string _consecutiveDuty{};
	int _consecutiveDutyLower{};
	int _consecutiveDutyUpper{};

	//侵入时长范围，格式：HH:mm-HH:mm，支持*表示忽略,表示Duty与DP Encroaching Period的重叠时长需在此范围内。支持*通配
	std::string _encroachingDuration{};
	int _encroachingDurationMinutesLower{};
	int _encroachingDurationMinutesUpper{};

	//同CMSCEB15, Duty层次的标签，支持 * 通配符（任意标签或者无标签）和 | 多个分开设置，为空则代表没有Duty标签
	std::vector<std::string> _overrideDutyAttributes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingBase(const Duty& duty, const std::string& base) const;

	//匹配Duty的配比
	bool MatchComposition(const Duty& duty) const;

	//判断Duty的国内和国际类型是否满足
	bool MatchDutyTypes(const Duty& duty) const;

	//判断Segment是否满足任务类型（计算BLH的任务类型）
	bool MatchSegmentAssignments(const Segment& segment) const;

    //判断航班是否满足航班机型条件
	bool MatchFlightFleets(const Segment& segment) const;

	bool MatchDepArps(const Segment& segment) const;

	bool MatchArvArps(const Segment& segment) const;

	//判断Duty中最大Segment飞时是否满足（Segment的assignment要求满足SegmentAssignments）
	bool MatchMaxSegmentFlightTime(const Duty& duty) const;

	//Segment飞时是否满足
	bool MatchSegmentFlightTime(const Segment& segment) const;

	//判断Duty的报告时间(即签到时间)范围
	bool MatchReportTime(const Duty& duty) const;

	//判断Duty的签到和签出时间是否侵犯特定时间段
	bool MatchDPEncroachingPeriod(const Duty& duty) const;

	//判断Duty是否满足Override Duty Attributes条件
	bool MatchDutyAttributes(const Duty& duty) const;

public:

	bool MatchRule(const Duty& duty, const std::string& base) const;

	bool CheckRule(const Duty& duty) const;

};

#endif //_SEGMENTRESTRICTIONFOREVAFDRULEPARAM_H_
