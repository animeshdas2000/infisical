import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
    ServiceTokenData
} from '../../models';
import {
    SALT_ROUNDS
} from '../../config';
import { userHasWorkspaceAccess } from '../../ee/helpers/checkMembershipPermissions';
import { ABILITY_READ } from '../../variables/organization';

/**
 * Return service token data associated with service token on request
 * @param req 
 * @param res 
 * @returns 
 */
export const getServiceTokenData = async (req: Request, res: Response) => {
    /* 
    #swagger.summary = 'Return Infisical Token data'
    #swagger.description = 'Return Infisical Token data'
    
    #swagger.security = [{
        "bearerAuth": []
    }]

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
					"properties": {
                        "serviceTokenData": {
                            "type": "object",
                            $ref: "#/components/schemas/ServiceTokenData",
                            "description": "Details of service token"
                        }
					}
                }
            }           
        }
    }   
    */

    return res.status(200).json(req.serviceTokenData);
}

/**
 * Create new service token data for workspace with id [workspaceId] and
 * environment [environment].
 * @param req 
 * @param res 
 * @returns 
 */
export const createServiceTokenData = async (req: Request, res: Response) => {
    let serviceToken, serviceTokenData;

    try {
        const {
            name,
            workspaceId,
            environment,
            encryptedKey,
            iv,
            tag,
            expiresIn,
            permissions
        } = req.body;

        const hasAccess = await userHasWorkspaceAccess(req.user, workspaceId, environment, ABILITY_READ)
        if (!hasAccess) {
            throw UnauthorizedRequestError({ message: "You do not have the necessary permission(s) perform this action" })
        }

        const secret = crypto.randomBytes(16).toString('hex');
        const secretHash = await bcrypt.hash(secret, SALT_ROUNDS);

        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

        serviceTokenData = await new ServiceTokenData({
            name,
            workspace: workspaceId,
            environment,
            user: req.user._id,
            expiresAt,
            secretHash,
            encryptedKey,
            iv,
            tag,
            permissions
        }).save();

        // return service token data without sensitive data
        serviceTokenData = await ServiceTokenData.findById(serviceTokenData._id);

        if (!serviceTokenData) throw new Error('Failed to find service token data');

        serviceToken = `st.${serviceTokenData._id.toString()}.${secret}`;

    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to create service token data'
        });
    }

    return res.status(200).send({
        serviceToken,
        serviceTokenData
    });
}

/**
 * Delete service token data with id [serviceTokenDataId].
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteServiceTokenData = async (req: Request, res: Response) => {
    let serviceTokenData;
    try {
        const { serviceTokenDataId } = req.params;

        serviceTokenData = await ServiceTokenData.findByIdAndDelete(serviceTokenDataId);

    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to delete service token data'
        });
    }

    return res.status(200).send({
        serviceTokenData
    });
}

function UnauthorizedRequestError(arg0: { message: string; }) {
    throw new Error('Function not implemented.');
}
