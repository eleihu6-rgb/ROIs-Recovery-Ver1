#pragma once

#include <string>
#include <memory>
#include <tuple>
#include <vector>
#include <set>
#include <map>

using namespace std;

class ROSTER;
class CREW;
class Pairing;
class Duty;
class Segment;
class CrewDataContext;

class TmCourse;
class TmPairingChart;
class TmDevice;
class TmDeviceTime;
class TmFootprint;
class TmProgram;
class TmProgramCourse;
class TmProgramCourseInstructor;
class TmProgramCoursePnr;
struct RosterProgramCourse;
struct TmProgramCourseAndSegment;

class TrainingCourseUtils {

public:

    //获得课程
    static std::shared_ptr<TmCourse> GetCourseByCourseId(const long long courseId, const std::shared_ptr<CrewDataContext>& dbData);

    //tuple<Program Course使用设备, Program Course使用设备时间>
    static std::tuple<std::shared_ptr<TmDevice>, std::shared_ptr<TmDeviceTime>> GetDeviceOfProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<CrewDataContext>& dbData);

    //按programId对TmProgramCourse分组(已排课)，返回map<programId,vector<RosterProgramCourse>>，vector<RosterProgramCourse>按programCourse.starttiime升序排序（仅针对学员）
    static const map<long long, vector<std::shared_ptr<RosterProgramCourse>>> GetRosterProgramCourseGroupByProgramId(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    //获得同一节课所有教员(包括：IP、CK、PNR等非学员角色)排班
    static const std::vector<std::shared_ptr<ROSTER>> GetInstructorRostersOnCourse(const string& groupId, const std::shared_ptr<CrewDataContext>& dbData);

    //获得Program的使用的PIP人数（IP+CK人数)，以及对应的crewId列表
    //simioe: 大阶段，phases：小阶段
    static std::set<string> GetPIPCrewsInProgram(const ROSTER* roster, const long long programId, const string& simioe, const vector<string>& phases, const std::shared_ptr<CrewDataContext>& dbData);

    static long long GetProgramCourseParentId(const std::shared_ptr<TmProgramCourse>& programCourse);

    static vector<long long> GetProgramCourseParentIds(const vector<std::shared_ptr<TmProgramCourse>>& programCourses);

    //获得SIM计划课程时长（单位：分钟）,从TmPairingChart中获得，可能返回多个
    static vector<int> GetCourseDurationWithSIM(const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const long long courseId, const std::shared_ptr<CrewDataContext>& dbData);

    static vector<std::shared_ptr<TmPairingChart>> GetPairingChart(const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const long long flightId, const long long courseId, const std::shared_ptr<CrewDataContext>& dbData);

    //获得训练计划program中所有已排课的programCourse(由于场景加载数据时间范围限制，training的roster数据可能不完整，因此直接通过crew来获取programCourse)
    //备注：由于场景加载数据时间范围限制，training的roster数据可能不完整，因此直接通过crew来获取programCourse
    static vector<std::shared_ptr<TmProgramCourse>> GetProgramCourses(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    //获得训练计划program中所有已排课的programCourse
    //备注：由于场景加载数据时间范围限制，training的roster数据可能不完整，因此直接通过crew来获取programCourse
    //@return map<programId, 培训计划program下已经排课的programCourse>
    static map<long long, vector<std::shared_ptr<TmProgramCourse>>> GetProgramCourseInProgram(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    //与教员在同一节课的学员角度，获得这些学员训练计划program中所有已排课的programCourse
    //备注：由于场景加载数据时间范围限制，training的roster数据可能不完整，因此直接通过crew来获取programCourse
    //@return map<programId, 培训计划program下已经排课的programCourse>
    static map<long long, vector<std::shared_ptr<TmProgramCourse>>> GetProgramCourseInProgramByInstructor(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    //获得训练计划program中所有programCourse(包括已排课和未排课)
    //@return map<programId, 培训计划program下所有排课的programCourse>
    static map<long long, vector<std::shared_ptr<TmProgramCourse>>> GetAllProgramCourseInProgram(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    //获得训练计划program中所有TmProgramCourseAndSegment(包括已排课和未排课)
    //@return map<dutyId, 培训计划program下已经排课的TmProgramCourseAndSegment>
    //static map<long long, vector<std::shared_ptr<TmProgramCourseAndSegment>>> GetAllProgramCourseAndSegmentInDuty(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData);

    //获得训练计划program中所有TmProgramCourseAndSegment(包括已排课和未排课)
    //@return map<programId, 培训计划program下已经排课的TmProgramCourseAndSegment>
    //static map<long long, vector<std::shared_ptr<TmProgramCourseAndSegment>>> GetAllProgramCourseAndSegmentInProgram(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData);

    //通过ParentId对tmProgramCourseList进行分组
    //@return map<TmProgramCourse.parentId, TmProgramCourse>
    static map<long long, vector<std::shared_ptr<TmProgramCourse>>> GetProgramCourseMapByParent(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList);

    /*通过programId获得course对应的buddy
    * @param programId 
    * @param tmProgramCourseList 在programId中的ProgramCourse列表
    * @return map<courseId, buddyCrewId列表>
    */
    static map<long long, set<string>> GetProgramBuddyMap(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CrewDataContext>& dbData);

    static map<long long, set<string>> GetProgramBuddyMap(const long long programId, const std::shared_ptr<CrewDataContext>& dbData);
    
    /*
    * 二个ProgramCourse是不是SubCourse关系
    * 父子课程时，只有父课程记录在RosterFlight（RosterId为父课程的RosterId），通过RosterFlight.subTmProgramCourseId记录子课程的programCourseId
    */
    static bool IsSubProgramCourseRelated(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<CrewDataContext>& dbData);

    //判断programCourse是不是sub course(子课程)
    static bool IsSubProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<CrewDataContext>& dbData);

    //判断programCourseInstructor是不是main course(主课程)的教员。返回nullptr，表示不是主子课程
    static shared_ptr<bool> IsMainCourseInstructor(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const std::shared_ptr<CrewDataContext>& dbData);

    //判断programCourseInstructor是不是sub course(子课程)的教员。返回nullptr，表示不是主子课程
    static shared_ptr<bool> IsSubCourseInstructor(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const std::shared_ptr<CrewDataContext>& dbData);

    //通过主课程的programCourseInstructor获得sub course(子课程)的program course。若programCourseInstructor不是主课程，则返回nullptr
    static const std::shared_ptr<TmProgramCourse> GetProgramCourseOfSubCourse(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const std::shared_ptr<CrewDataContext>& dbData);

    //获得programCourse的SIM或GROUND的课程时长，若存在午餐时间，则扣除午餐时长
    static int GetSIMOrGNDProgramCourseDuration(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmCourse>& tmCourse, const int offsetTZMinutes, const std::shared_ptr<CrewDataContext>& dbData);

    /*获得与TmProgramCourse同一节的教员列表。
    * 父子课程时，只有父课程记录在RosterFlight（RosterId为父课程的RosterId），通过RosterFlight.subTmProgramCourseId记录子课程的programCourseId
    * @param programCourse 当前programCourse
    * @param role 教员角色
    * @param includeSubCourse 当前programCourse是子课程时，是否获得父课程的教员。true：当前programCourse是子课程获得父课程的教员，false：当前programCourse是子课程不获得父课程的教员
    */
    static const vector<std::shared_ptr<TmProgramCourseInstructor>> GetInstructorListByProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const string& role, const bool includeSubCourse, const std::shared_ptr<CrewDataContext>& dbData);

    /*
    * 获得与SubCourse TmProgramCourse同一节的教员列表。
    * @param programCourse 当前sub course的programCourse
    * @param role 教员角色
    */
    static const vector<std::shared_ptr<TmProgramCourseInstructor>> GetSubCourseInstructorListByProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const string& role, const std::shared_ptr<CrewDataContext>& dbData);

    /*获得roster对应segment的所有footprint
    * @param containInstructor 是否包含非学员角色（如：IP、CK、PNR等教员角色）的footprint
    */
    static const vector<std::shared_ptr<TmFootprint>> GetFootprintList(const ROSTER* roster, const Segment* segment, const std::shared_ptr<CrewDataContext>& dbData, const bool containInstructor = true);

    /*
    * 通过Crew获得其中所有航班的课程信息，
    * 返回map<航班Id, course信息列表>
    */
    static const map<long long, vector<std::shared_ptr<TmCourse>>> GetFlightCourseMap(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    /*
    * 通过Roster获得其中所有航班的课程信息，
    * 返回map<航班Id, course信息列表>
    */
    static const map<long long, vector<std::shared_ptr<TmCourse>>> GetFlightCourseMap(const ROSTER* roster, const std::shared_ptr<CrewDataContext>& dbData);

    /*
    * 通过Pairing获得其中所有航班的课程信息，
    * 返回map<航班Id, course信息列表>
    */
    static const map<long long, vector<std::shared_ptr<TmCourse>>> GetFlightCourseMap(const Pairing* pairing, const std::shared_ptr<CrewDataContext>& dbData);

    /*
    * 在prevProgramCourse和currProgramCourse连续前提下，获得Current ProgramCourse新增的连续天数。
    * 若prevProgramCourse和currProgramCourse连续，则返回currProgramCourse跨越天数(即Curr ProgramCourse的连续天数)
    * 注意：若prevProgramCourse的最后一天和currProgramCourse的第一个天在同一天，则返回：“currProgramCourse跨越天数” - 1
    * @return 返回-1表示不连续
    */
    static int GetConsecutiveDaysWithCurrProgramCourse(const std::shared_ptr<TmProgramCourse>& prevProgramCourse, const std::shared_ptr<TmProgramCourse>& currProgramCourse, const int offsetTZMinutes);
public:
    //在programCourseList列表中，找到与当前currProgramCourse（根据时间段startTime和endTime）最接近的programCourse，如果有多个同样startTime的programCourse，则返回任意一个
    static std::shared_ptr<TmProgramCourse> FindNearestProgramCourse(const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList);

private:
    static vector<std::shared_ptr<TmPairingChart>> GetPairingChart(const std::shared_ptr<TmProgram>& tmProgram, const long long flightId, const long long courseId, const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData);

    //获得program中course的buddy
    static set<string> GetProgramBuddyByCourse(const long long programId, const long long courseId, const std::shared_ptr<CrewDataContext>& dbData);

};