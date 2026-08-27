/**
 * @file LimitLegAndStationForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITLEGANDSTATIONFOREVAFDRULE_H_
#define _LIMITLEGANDSTATIONFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitLegAndStationForEvaFdRuleParam.h"

struct ActualLegStationCount {
    int legCount = 0;//同一站点，一次起飞一次降落分别计算，记为 2次
    int stationCount = 0;//同一站点，一次起飞一次降落合并计算，记为1次
    set<string> viaStations;//经过机场
    int legCountInStations = 0;//同一站点，一次起飞一次降落分别计算，记为 2次（Segment的起飞和落地在tmProgramCourseMoreLeg.allLegStations中站点）
    int stationCountInStations = 0;//同一站点，一次起飞一次降落合并计算，记为1次（Segment的起飞和落地在tmProgramCourseMoreLeg.allLegStations中站点）
    set<string> viaStationsInStations;//经过机场（Segment的起飞和落地在tmProgramCourseMoreLeg.allLegStations中站点）
    int legCountMustNotGo = 0; //不能去航段数量（Segment的起飞和落地不能在tmProgramCourseMoreLeg中allLegStations站点中）
    int stationCountMustNotGo = 0;//不能去站点数量（Segment的起飞或落地不能在tmProgramCourseMoreLeg中allLegStations站点中）
};

class LimitLegAndStationForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7253;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitLegAndStationForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitLegAndStationForEvaFdRule::RuleFuncId, LimitLegAndStationForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitLegAndStationForEvaFdRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    std::vector<LimitLegAndStationForEvaFdRuleParam> _ruleParams;

    bool CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList ) const;

    bool CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore) const;

    bool CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    /*
    * 检查经过站点(tmProgramCourseMore->legStation == "LEG")
    * @param actualViaStations：实际经过站点
    */
    bool CheckViaStationByLeg(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    /*
    * 检查经过站点(tmProgramCourseMore->legStation == "STATION")
    * @param actualViaStations：实际经过站点
    */
    bool CheckViaStationByStation(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    //返回值：tuple<LegCount,StationCount,经过机场列表>
    //ActualLegStationCount GetActualLegStationCount(const vector<std::shared_ptr<Segment>>& segments, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    ////获得Line课程所有航段，并按照航段开始时间升序排序
    //const vector<std::shared_ptr<Segment>> GetSegments(const vector<std::shared_ptr<TmProgramCourse>>& tmLineProgramCourseList, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    ////legBefore、legAfter从1开始
    //const vector<std::shared_ptr<Segment>> GetFilterSegments(const vector<std::shared_ptr<Segment>>& allSegments, const string& legRange, const int legBefore, const int legAfter) const;

    //bool MatchLegPassenger(const std::shared_ptr<Segment>& segment, const string& legPassenger) const;

    //返回值：tuple<LegCount,StationCount,经过机场列表>
    ActualLegStationCount GetActualLegStationCount(const vector<std::shared_ptr<TmProgramCourse>>& segmentProgramCourses, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    //获得Line课程所有航段，并按照航段开始时间升序排序
    const vector<std::shared_ptr<TmProgramCourse>> GetSegmentProgramCourses(const vector<std::shared_ptr<TmProgramCourse>>& tmLineProgramCourseList, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    //legBefore、legAfter从1开始
    const vector<std::shared_ptr<TmProgramCourse>> GetFilterSegmentProgramCourses(const vector<std::shared_ptr<TmProgramCourse>>& allSegmentProgramCourses, const string& legRange, const int legBefore, const int legAfter) const;

    bool MatchLegPassenger(const std::shared_ptr<TmProgramCourse>& segmentProgramCourse, const string& legPassenger) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForViaStation(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    void ThrowRuleViolationForLegSector(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

    void ThrowRuleViolationForLegStation(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const;

};


#endif //_LIMITLEGANDSTATIONFOREVAFDRULE_H_
