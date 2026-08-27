/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/8/18 14:46
 * @File:    TargetVariant.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TARGETVARIANT_H
#define TRAININGOPTIMIZER_TARGETVARIANT_H

#include "variant"
#include "DBTrainingCourse.h"
#include "DBTrainingCourseRoleRequirement.h"
#include "DBTrainingCourseRole.h"
#include "DBTrainingProgram.h"
#include "DBTrainingProgramCourse.h"
#include "DBTrainingPairingChart.h"
#include "DBTrainingDevice.h"
#include "DBTrainingProgramCourseParticipant.h"
#include "DBTrainingProgramCourseInstructorParticipant.h"
#include "DBTrainingDeviceOccupiedTime.h"
#include "DBTrainingCourseTime.h"
#include "DBTrainingFootprintCourse.h"
#include "DBTrainingFootprintCourseTrainee.h"
#include "DBTrainingFootprintCourseSector.h"
#include "DBTrainingFootprint.h"
#include "DBTrainingFootprintCourseIpRole.h"
#include "DBTrainingFootprintCourseRole.h"
#include "DBTrainingProgramCourseIpRole.h"
#include "DBTrainingProgramCourseRole.h"

using TargetVariant = std::variant<
        DBTrainingCourse *,
        DBTrainingCourseRoleRequirement *,
        DBTrainingCourseRole *,
        DBTrainingProgram *,
        DBTrainingProgramCourse *,
        DBTrainingPairingChart *,
        DBTrainingDevice *,
        DBTrainingProgramCourseParticipant *,
        DBTrainingProgramCourseInstructorParticipant *,
        DBTrainingDeviceOccupiedTime *,
        DBTrainingCourseBrief *,
        DBTrainingCourseDuration *,
        DBTrainingFootprintCourse *,
        DBTrainingFootprintCourseTrainee *,
        DBTrainingFootprintCourseSector *,
        DBTrainingFootprint *,
        DBTrainingFootprintCourseIpRole *,
        DBTrainingFootprintCourseRole *,
        DBTrainingProgramCourseIpRole *,
        DBTrainingProgramCourseRole *
>;

#endif //TRAININGOPTIMIZER_TARGETVARIANT_H
